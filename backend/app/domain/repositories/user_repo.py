from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.domain.models import User


@dataclass(slots=True)
class UserCredentials:
    user: User
    password_hash: str


class IUserRepo(Protocol):
    async def get_by_id(self, user_id: str) -> User | None: ...
    async def get_credentials_by_email(self, email: str) -> UserCredentials | None: ...
    async def create(
        self,
        *,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
    ) -> User: ...
    async def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None = None,
        character_key: str | None = None,
        role_label: str | None = None,
    ) -> User: ...
    async def list_recent(self, *, limit: int) -> list[User]: ...
