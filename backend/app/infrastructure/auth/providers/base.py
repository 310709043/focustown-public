from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class TokenPair:
    access_token: str
    refresh_token: str


@dataclass(slots=True)
class Principal:
    user_id: str
    raw_claims: dict


@dataclass(slots=True, frozen=True)
class AuthCredentials:
    """Plaintext credentials passed through to providers that delegate
    sign-in (Cognito needs email + password to call admin_initiate_auth).
    Local mode ignores this entirely.
    """

    email: str
    password: str


class IAccessTokenVerifier(Protocol):
    """Read-side of the auth port — verify a bearer token, return its
    Principal. Middleware and WebSocket entry points should depend on this
    Protocol rather than the full AuthProvider, so they cannot accidentally
    issue tokens or rotate passwords (ISP).
    """

    async def verify_access_token(self, token: str) -> Principal: ...


class IAuthSessionWriter(Protocol):
    """Write-side of the auth port — every operation that mutates provider
    state (creates a user, issues tokens, rotates passwords). Callers that
    drive sign-up / sign-in / password reset depend on this Protocol.
    """

    async def sign_up_user(self, *, email: str, password: str) -> str:
        """Provision the identity at the provider side. Returns the provider's
        external id (Cognito ``sub``). Local impl returns "" — the local users
        row is the source of truth and no external provisioning is needed.

        Called from AuthService.sign_up BEFORE creating the local row so an
        existing-email conflict can be surfaced by either side cleanly.
        """
        ...

    async def issue_tokens(
        self,
        *,
        user_id: str,
        credentials: AuthCredentials | None = None,
    ) -> TokenPair:
        """Issue access + refresh tokens.

        Local: ignores credentials; signs HS256 JWT with user_id as sub.
        Cognito: requires credentials; calls admin_initiate_auth with
        USER_PASSWORD_AUTH and surfaces Cognito's token pair unchanged.
        """
        ...

    async def refresh(self, refresh_token: str) -> TokenPair: ...
    async def set_password(self, *, user_id: str, new_password: str) -> None:
        """Update the password for an existing user at the provider side.

        Local impl is a no-op (the user's bcrypt hash is rewritten by the
        repository, not by the provider). Cognito impl calls
        admin_set_user_password so a password reset stays in sync with the
        user pool. Called from PasswordResetService after the local hash is
        updated.
        """
        ...


class AuthProvider(IAccessTokenVerifier, IAuthSessionWriter, Protocol):
    """Composed port for callers that need both sides (LocalJWTProvider,
    CognitoProvider implement this). New consumers should prefer the
    narrower IAccessTokenVerifier or IAuthSessionWriter where possible.
    """
