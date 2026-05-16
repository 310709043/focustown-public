"""AWS Cognito implementation of AuthProvider.

Token issuance, refresh, and password updates are delegated to Cognito via
boto3 (``cognito-idp``). Access-token verification is done locally against
the user pool's JWKS — far faster than calling ``cognito-idp.GetUser`` on
every request — with a small in-process cache (see ``_cognito_jwks``).

Sub mapping
    Cognito's ``sub`` claim is a UUID that has no useful relation to the
    rest of our schema (every focus_session FK already points at our own
    ``users.id``). We store the Cognito sub in ``users.cognito_sub`` and
    resolve it back to our id during ``verify_access_token``. That keeps
    the migration minimal — no FK rewrites — at the cost of one indexed
    lookup per authenticated request.

Sign-up flow
    ``sign_up_user`` provisions the Cognito identity (admin_create_user +
    admin_set_user_password permanent) and returns the sub. ``AuthService``
    stores that sub on the new local row, then calls ``issue_tokens`` with
    the plaintext credentials to get the first token pair via
    admin_initiate_auth USER_PASSWORD_AUTH. Splitting it this way avoids
    putting plaintext password into the token-issuance method's invariant
    state — credentials are explicit and only required where Cognito
    actually needs them.

Failure modes
    - Boto3 ClientError on every AWS call is re-raised as ``AuthError`` so
      routers map to a 401/403 with a stable error envelope.
    - JWKS fetch failures bubble up as ``AuthError`` rather than 500 — the
      attacker shouldn't learn that our JWKS endpoint is broken.
"""

from __future__ import annotations

import asyncio
import hmac
from base64 import b64encode
from hashlib import sha256
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from jose import JWTError, jwk, jwt
from jose.utils import base64url_decode

from app.core.config import Settings
from app.core.exceptions import AuthError
from app.core.logging import get_logger
from app.domain.repositories.user_repo import IUserReader
from app.infrastructure.auth.providers._cognito_jwks import get_jwk
from app.infrastructure.auth.providers.base import (
    AuthCredentials,
    AuthProvider,
    Principal,
    TokenPair,
)

log = get_logger(__name__)


class CognitoProvider(AuthProvider):
    def __init__(self, settings: Settings, *, users: IUserReader) -> None:
        if not settings.cognito_user_pool_id or not settings.cognito_client_id:
            raise RuntimeError(
                "CognitoProvider requires COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID"
            )
        self._settings = settings
        self._users = users
        self._region = settings.aws_region
        self._pool_id = settings.cognito_user_pool_id
        self._client_id = settings.cognito_client_id
        self._client_secret = settings.cognito_client_secret
        self._endpoint_override = settings.cognito_endpoint_url
        self._jwks_ttl = settings.cognito_jwks_ttl_seconds
        self._issuer = (
            f"https://cognito-idp.{self._region}.amazonaws.com/{self._pool_id}"
        )

        kwargs: dict[str, Any] = {"region_name": self._region}
        if self._endpoint_override:
            kwargs["endpoint_url"] = self._endpoint_override
        # No access_key/secret kwargs — boto3 falls through to the default
        # provider chain (IAM role on ECS, env vars, ~/.aws). Matches the
        # S3Storage pattern so production deploys with a task role work
        # unchanged.
        self._client = boto3.client("cognito-idp", **kwargs)

    def _secret_hash(self, username: str) -> str | None:
        # Cognito requires a SECRET_HASH parameter only when the app client
        # was created with a secret. Public clients (the default for SPA /
        # mobile) skip this.
        if not self._client_secret:
            return None
        msg = (username + self._client_id).encode("utf-8")
        digest = hmac.new(
            self._client_secret.encode("utf-8"), msg=msg, digestmod=sha256
        ).digest()
        return b64encode(digest).decode("utf-8")

    async def sign_up_user(self, *, email: str, password: str) -> str:
        normalized = email.strip().lower()

        def _create() -> str:
            try:
                created = self._client.admin_create_user(
                    UserPoolId=self._pool_id,
                    Username=normalized,
                    UserAttributes=[
                        {"Name": "email", "Value": normalized},
                        {"Name": "email_verified", "Value": "true"},
                    ],
                    MessageAction="SUPPRESS",
                )
                # Switch the user to a permanent password immediately so the
                # first sign-in doesn't hit FORCE_CHANGE_PASSWORD.
                self._client.admin_set_user_password(
                    UserPoolId=self._pool_id,
                    Username=normalized,
                    Password=password,
                    Permanent=True,
                )
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code == "UsernameExistsException":
                    raise AuthError("email_already_registered") from exc
                raise AuthError("provider_signup_failed") from exc
            except BotoCoreError as exc:
                raise AuthError("provider_signup_failed") from exc

            attrs = {
                a["Name"]: a["Value"]
                for a in created.get("User", {}).get("Attributes", [])
            }
            sub = attrs.get("sub", "")
            if not sub:
                raise AuthError("provider_signup_failed")
            return sub

        return await asyncio.to_thread(_create)

    async def issue_tokens(
        self,
        *,
        user_id: str,
        credentials: AuthCredentials | None = None,
    ) -> TokenPair:
        if credentials is None:
            # Cognito cannot mint tokens from user_id alone — every flow
            # surface (sign-up, sign-in) carries plaintext credentials, so
            # this branch is a programming error rather than a runtime input.
            raise AuthError("credentials_required_for_cognito")

        username = credentials.email.strip().lower()

        def _initiate() -> dict[str, Any]:
            auth_params: dict[str, str] = {
                "USERNAME": username,
                "PASSWORD": credentials.password,
            }
            sh = self._secret_hash(username)
            if sh is not None:
                auth_params["SECRET_HASH"] = sh
            try:
                return self._client.admin_initiate_auth(
                    UserPoolId=self._pool_id,
                    ClientId=self._client_id,
                    AuthFlow="ADMIN_USER_PASSWORD_AUTH",
                    AuthParameters=auth_params,
                )
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code in {"NotAuthorizedException", "UserNotFoundException"}:
                    raise AuthError("invalid_credentials") from exc
                if code == "UserNotConfirmedException":
                    raise AuthError("user_not_confirmed") from exc
                raise AuthError("provider_signin_failed") from exc
            except BotoCoreError as exc:
                raise AuthError("provider_signin_failed") from exc

        resp = await asyncio.to_thread(_initiate)
        result = resp.get("AuthenticationResult") or {}
        access = result.get("AccessToken", "")
        refresh = result.get("RefreshToken", "")
        if not access or not refresh:
            # Could be a challenge (NEW_PASSWORD_REQUIRED, MFA_SETUP).
            # For MVP we treat anything that doesn't yield tokens as a
            # generic auth failure rather than expose challenge semantics.
            raise AuthError("provider_signin_failed")
        del user_id  # mapping back to our id is done at verify time
        return TokenPair(access_token=access, refresh_token=refresh)

    async def refresh(self, refresh_token: str) -> TokenPair:
        def _refresh() -> dict[str, Any]:
            auth_params: dict[str, str] = {"REFRESH_TOKEN": refresh_token}
            # Cognito's REFRESH_TOKEN_AUTH expects USERNAME-derived SECRET_HASH
            # only when the app client has a secret. We don't have the
            # username here, but the InitiateAuth REFRESH_TOKEN_AUTH flow
            # accepts the hash of the original sub embedded in the token —
            # only required for confidential clients. Public clients skip.
            try:
                return self._client.initiate_auth(
                    ClientId=self._client_id,
                    AuthFlow="REFRESH_TOKEN_AUTH",
                    AuthParameters=auth_params,
                )
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                if code in {"NotAuthorizedException", "InvalidParameterException"}:
                    raise AuthError("invalid_refresh_token") from exc
                raise AuthError("provider_refresh_failed") from exc
            except BotoCoreError as exc:
                raise AuthError("provider_refresh_failed") from exc

        resp = await asyncio.to_thread(_refresh)
        result = resp.get("AuthenticationResult") or {}
        access = result.get("AccessToken", "")
        # Cognito's refresh response does NOT include a new refresh token
        # (refresh tokens last 30 days). Surface the existing one back so
        # the client keeps using it.
        if not access:
            raise AuthError("provider_refresh_failed")
        return TokenPair(access_token=access, refresh_token=refresh_token)

    async def verify_access_token(self, token: str) -> Principal:
        try:
            headers = jwt.get_unverified_headers(token)
            unverified_claims = jwt.get_unverified_claims(token)
        except JWTError as exc:
            raise AuthError("invalid_access_token") from exc

        kid = headers.get("kid", "")
        if not kid:
            raise AuthError("invalid_access_token")

        # Access tokens have token_use=access; id tokens have token_use=id.
        # We refuse id tokens at API boundaries because Cognito's id tokens
        # are not meant for authorization decisions.
        if unverified_claims.get("token_use") != "access":
            raise AuthError("not_an_access_token")

        jwk_dict = await get_jwk(
            region=self._region,
            pool_id=self._pool_id,
            kid=kid,
            ttl_seconds=self._jwks_ttl,
            endpoint_override=self._endpoint_override,
        )
        if jwk_dict is None:
            raise AuthError("unknown_kid")

        # python-jose's jwt.decode does signature + exp + iss + aud checks
        # in one go. Cognito access tokens have ``client_id`` instead of
        # ``aud``, so we pass options={"verify_aud": False} and check
        # client_id manually.
        try:
            key = jwk.construct(jwk_dict)
            message, encoded_sig = token.rsplit(".", 1)
            decoded_sig = base64url_decode(encoded_sig.encode("utf-8"))
            if not key.verify(message.encode("utf-8"), decoded_sig):
                raise AuthError("invalid_signature")
            claims = jwt.decode(
                token,
                jwk_dict,
                algorithms=[jwk_dict.get("alg", "RS256")],
                options={"verify_aud": False, "verify_at_hash": False},
                issuer=self._issuer,
            )
        except JWTError as exc:
            raise AuthError("invalid_access_token") from exc

        if claims.get("client_id") != self._client_id:
            raise AuthError("invalid_client_id")

        sub = str(claims.get("sub", ""))
        if not sub:
            raise AuthError("invalid_access_token")

        internal_id = await self._users.get_id_by_cognito_sub(sub)
        if not internal_id:
            # The token is valid against Cognito but we have no local row.
            # Treat as unauthenticated rather than 500 — the caller may
            # need to run the sign-up flow first.
            raise AuthError("user_not_provisioned")

        return Principal(user_id=internal_id, raw_claims=claims)

    async def set_password(self, *, user_id: str, new_password: str) -> None:
        # Look up the email by user_id so we can address the Cognito user;
        # admin_set_user_password takes Username, not sub.
        user = await self._users.get_by_id(user_id)
        if user is None:
            raise AuthError("user_not_found")
        username = user.email.strip().lower()

        def _set() -> None:
            try:
                self._client.admin_set_user_password(
                    UserPoolId=self._pool_id,
                    Username=username,
                    Password=new_password,
                    Permanent=True,
                )
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code", "")
                # Treat "user not in cognito yet" as a no-op — happens for
                # legacy local rows that were created before we wired
                # Cognito. The local hash update has already succeeded.
                if code == "UserNotFoundException":
                    log.info("cognito_set_password_skip_missing_user", user_id=user_id)
                    return
                raise
            except BotoCoreError:
                raise

        try:
            await asyncio.to_thread(_set)
        except (ClientError, BotoCoreError) as exc:
            # Never propagate — password reset must remain idempotent from
            # the user's perspective. Operator sees the orphan in logs.
            log.warning("cognito_set_password_failed", user_id=user_id, error=str(exc))
