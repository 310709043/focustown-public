from __future__ import annotations

from typing import Protocol

from app.core.sentinels import UNSET, UnsetType
from app.domain.models.room import Room, RoomVisibility


class RoomAlreadyExistsError(Exception):
    """Raised by ``IRoomRepo.create`` when the owner already has a room.

    Lives in the domain layer (not core/exceptions) so that the SQL impl
    can translate Postgres ``IntegrityError`` into this lifted error
    without leaking sqlalchemy types upward. ``RoomService`` catches it
    on the concurrent lazy-create path and re-reads via ``get_by_owner``.
    """


class IRoomRepo(Protocol):
    async def get_by_owner(self, owner_user_id: str) -> Room | None: ...

    async def get_by_id(self, room_id: str) -> Room | None: ...

    async def create(
        self,
        *,
        room_id: str,
        owner_user_id: str,
        name: str,
        theme: str,
        visibility: RoomVisibility = "public",
        max_visitors: int = 5,
    ) -> Room: ...

    async def update(
        self,
        *,
        room_id: str,
        name: str | UnsetType = UNSET,
        theme: str | UnsetType = UNSET,
    ) -> Room: ...
