from __future__ import annotations

from datetime import UTC, datetime

from app.core.config import Settings
from app.core.exceptions import AuthError
from app.core.security import create_token, decode_token
from app.infrastructure.auth.providers.base import (
    AuthCredentials,
    AuthProvider,
    Principal,
    TokenPair,
)


class LocalJWTProvider(AuthProvider):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._redis = None  # Lazily imported to avoid circular deps

    def _get_redis(self):  # type: ignore[no-untyped-def]
        if self._redis is None:
            from app.infrastructure.cache.redis_client import get_redis
            self._redis = get_redis()
        return self._redis

    async def sign_up_user(self, *, email: str, password: str) -> str:
        # Local mode has no external identity store; the users row IS the
        # identity. Caller should treat "" as "no external mapping".
        del email, password
        return ""

    async def issue_tokens(
        self,
        *,
        user_id: str,
        credentials: AuthCredentials | None = None,
    ) -> TokenPair:
        del credentials
        return TokenPair(
            access_token=create_token(self._settings, subject=user_id, kind="access"),
            refresh_token=create_token(self._settings, subject=user_id, kind="refresh"),
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        claims = decode_token(self._settings, refresh_token)
        if claims.get("type") != "refresh":
            raise AuthError("not_a_refresh_token")
        user_id = str(claims.get("sub", ""))
        if not user_id:
            raise AuthError("invalid_refresh_token")

        # Check if all refresh tokens for this user have been revoked
        # (e.g. user re-authenticated on another device).
        redis = self._get_redis()
        revoked_at = await redis.get(f"auth:refresh_revoked:{user_id}")
        if revoked_at is not None:
            token_iat = claims.get("iat", 0)
            try:
                revoked_ts = float(revoked_at)
            except (ValueError, TypeError):
                revoked_ts = 0.0
            if token_iat < revoked_ts:
                raise AuthError("refresh_token_revoked")

        return await self.issue_tokens(user_id=user_id)

    async def verify_access_token(self, token: str) -> Principal:
        claims = decode_token(self._settings, token)
        if claims.get("type") != "access":
            raise AuthError("not_an_access_token")
        user_id = str(claims.get("sub", ""))
        if not user_id:
            raise AuthError("invalid_access_token")
        return Principal(user_id=user_id, raw_claims=claims)

    async def revoke_all_refresh_tokens(self, user_id: str) -> None:
        """Invalidate all outstanding refresh tokens for a user.

        Called on sign-in, sign-up, and password reset. Stores a timestamp
        in Redis; any refresh token issued before this timestamp is rejected.
        TTL matches the refresh token TTL so the key auto-expires.
        """
        redis = self._get_redis()
        now = datetime.now(UTC).timestamp()
        ttl = self._settings.jwt_refresh_ttl_days * 86400
        await redis.set(
            f"auth:refresh_revoked:{user_id}",
            str(now),
            ex=ttl,
        )

    async def set_password(self, *, user_id: str, new_password: str) -> None:
        # Local mode stores bcrypt in the users table; the repository write
        # in PasswordResetService is the source of truth. Nothing to do here.
        del user_id, new_password
