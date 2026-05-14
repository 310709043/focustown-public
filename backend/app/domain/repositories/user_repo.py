from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.domain.models import User


@dataclass(slots=True)
class UserCredentials:
    user: User
    password_hash: str


class IUserRepo(Protocol):
    async def get_by_id(self, user_id: str) -> User | None: ...
    async def get_by_email(self, email: str) -> User | None: ...
    async def get_credentials_by_email(self, email: str) -> UserCredentials | None: ...
    async def create(
        self,
        *,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
        terms_accepted_at: datetime | None = None,
        terms_version: str | None = None,
        marketing_opt_in: bool = False,
        marketing_opt_in_at: datetime | None = None,
    ) -> User: ...
    async def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None = None,
        character_key: str | None = None,
        role_label: str | None = None,
    ) -> User: ...
    async def update_password_hash(self, *, user_id: str, password_hash: str) -> None: ...
    async def list_recent(self, *, limit: int) -> list[User]: ...
    async def get_many_by_ids(self, user_ids: list[str]) -> list[User]: ...
