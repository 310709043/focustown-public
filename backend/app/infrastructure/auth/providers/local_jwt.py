from __future__ import annotations

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
        return await self.issue_tokens(user_id=user_id)

    async def verify_access_token(self, token: str) -> Principal:
        claims = decode_token(self._settings, token)
        if claims.get("type") != "access":
            raise AuthError("not_an_access_token")
        user_id = str(claims.get("sub", ""))
        if not user_id:
            raise AuthError("invalid_access_token")
        return Principal(user_id=user_id, raw_claims=claims)

    async def set_password(self, *, user_id: str, new_password: str) -> None:
        # Local mode stores bcrypt in the users table; the repository write
        # in PasswordResetService is the source of truth. Nothing to do here.
        del user_id, new_password
