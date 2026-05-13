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


class AuthProvider(Protocol):
    """Abstraction over the identity provider.

    MVP: LocalJWTProvider (validates locally-issued JWTs against bcrypt store).
    Future: CognitoProvider (delegates token issuance + verification to AWS).
    """

    async def issue_tokens(self, *, user_id: str) -> TokenPair: ...
    async def refresh(self, refresh_token: str) -> TokenPair: ...
    async def verify_access_token(self, token: str) -> Principal: ...
