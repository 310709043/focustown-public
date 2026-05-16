from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.core.sentinels import UNSET, UnsetType
from app.domain.models import User


@dataclass(slots=True)
class UserCredentials:
    user: User
    password_hash: str


class IUserReader(Protocol):
    """Read-only view over users.

    Services that never write should depend on this Protocol so they
    cannot accidentally call a mutator.
    """

    async def get_by_id(self, user_id: str) -> User | None: ...
    async def get_by_email(self, email: str) -> User | None: ...
    async def get_credentials_by_email(self, email: str) -> UserCredentials | None: ...
    async def list_recent(self, *, limit: int) -> list[User]: ...
    async def get_many_by_ids(self, user_ids: list[str]) -> list[User]: ...
    async def list_bots(self) -> list[User]: ...
    async def get_id_by_cognito_sub(self, cognito_sub: str) -> str | None: ...


class IUserWriter(Protocol):
    """Write-side over users (create + targeted updates)."""

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
        cognito_sub: str | None = None,
    ) -> User: ...
    async def set_cognito_sub(self, *, user_id: str, cognito_sub: str) -> None: ...
    async def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None = None,
        character_key: str | None = None,
        role_label: str | None = None,
    ) -> User: ...
    async def update_password_hash(self, *, user_id: str, password_hash: str) -> None: ...
    async def update_equipment(
        self,
        *,
        user_id: str,
        equipped_vehicle_item_id: str | None | UnsetType = UNSET,
        equipped_avatar_item_id: str | None | UnsetType = UNSET,
    ) -> User: ...


class IUserRepo(IUserReader, IUserWriter, Protocol):
    """Full user repository — composes reader + writer.

    Callers that genuinely need both sides (e.g. ``PasswordResetService``)
    depend on this; everything else should narrow to ``IUserReader`` or
    ``IUserWriter`` per Interface Segregation.
    """
