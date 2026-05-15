from __future__ import annotations

from typing import Protocol

from app.core.sentinels import UNSET, UnsetType
from app.domain.models.room_item import RoomItem


class IRoomItemReader(Protocol):
    """Read-only view over room_items.

    Services that only render or count items (e.g. visitor read paths)
    should depend on this Protocol so they cannot accidentally call a
    mutator.
    """

    async def list_for_room(self, room_id: str) -> list[RoomItem]: ...
    async def get(self, item_id: str) -> RoomItem | None: ...


class IRoomItemWriter(Protocol):
    """Write-side over room_items (place, move, remove)."""

    async def create(
        self,
        *,
        item_id: str,
        room_id: str,
        user_item_id: str,
        x: int,
        y: int,
        z_index: int,
    ) -> RoomItem: ...

    async def update_position(
        self,
        *,
        item_id: str,
        x: int,
        y: int,
        z_index: int | UnsetType = UNSET,
    ) -> RoomItem: ...

    async def delete(self, item_id: str) -> None: ...


class IRoomItemRepo(IRoomItemReader, IRoomItemWriter, Protocol):
    """Full room_items repository — composes reader + writer.

    Callers that genuinely need both sides (e.g. ``RoomDecorationService``)
    depend on this; everything else should narrow to ``IRoomItemReader`` or
    ``IRoomItemWriter`` per Interface Segregation (mirrors the
    ``IUserRepo`` precedent in user_repo.py).
    """
