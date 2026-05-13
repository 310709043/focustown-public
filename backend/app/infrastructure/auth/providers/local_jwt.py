from __future__ import annotations

from app.core.config import Settings
from app.core.exceptions import AuthError
from app.core.security import create_token, decode_token
from app.infrastructure.auth.providers.base import AuthProvider, Principal, TokenPair


class LocalJWTProvider(AuthProvider):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def issue_tokens(self, *, user_id: str) -> TokenPair:
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
