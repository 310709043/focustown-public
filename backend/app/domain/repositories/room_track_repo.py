from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True, frozen=True)
class RoomTrackRecord:
    id: str
    room_id: str
    track_id: str
    position: int


class IRoomTrackReader(Protocol):
    """Read-only view over a room's playlist.

    Phase 8's visitor read endpoint will depend on this Protocol so it
    cannot accidentally mutate the playlist.
    """

    async def list_by_room(self, room_id: str) -> list[RoomTrackRecord]: ...

    async def max_position(self, room_id: str) -> int | None:
        """Return the highest ``position`` for this room, or ``None`` if
        the playlist is empty. Service uses this to append at the end."""
        ...


class IRoomTrackWriter(Protocol):
    """Write-side of the playlist port."""

    async def add(
        self,
        *,
        item_id: str,
        room_id: str,
        track_id: str,
        position: int,
    ) -> RoomTrackRecord:
        """Insert a row.

        Raises ``IdempotencyViolationError`` if the UNIQUE
        ``(room_id, track_id)`` constraint trips. Adapters are responsible
        for translating their storage-native uniqueness exception (e.g.
        SQLAlchemy ``IntegrityError``) into the domain exception.
        """

    async def remove(self, *, room_id: str, track_id: str) -> bool:
        """Delete the row matching ``(room_id, track_id)``. Returns
        ``True`` if a row was removed, ``False`` otherwise."""
        ...


class IRoomTrackRepo(IRoomTrackReader, IRoomTrackWriter, Protocol):
    """Full playlist repository — Reader + Writer.

    Services that need both sides (e.g. ``RoomTrackService.add_for_user``,
    which queries ``max_position`` then writes) depend on this composed
    Protocol; consumers that only read (Phase 8 visitor view) narrow to
    ``IRoomTrackReader`` per ISP.
    """
