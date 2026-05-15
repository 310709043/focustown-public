from __future__ import annotations

from typing import Protocol

from app.domain.models.room_playback import RoomPlayback


class IRoomPlaybackReader(Protocol):
    """Read-only view over room_playback.

    Visitor read paths and the drift-correction snapshot fetch both
    depend on this Protocol; the service itself also calls
    ``get_by_room`` to compute the *next* state from the current one
    before passing the result to the writer.
    """

    async def get_by_room(self, room_id: str) -> RoomPlayback | None: ...


class IRoomPlaybackWriter(Protocol):
    """Write-side over room_playback.

    Single mutation entry point — every transition (play / pause /
    change_track) ends up rewriting the same row, so an upsert keyed
    by ``room_id`` is the right abstraction. Implementations use
    ``ON CONFLICT (room_id) DO UPDATE`` (Postgres) or in-memory swap
    (fakes); both are observationally idempotent.
    """

    async def upsert(
        self,
        *,
        room_id: str,
        current_track_id: str | None,
        started_at_ms: int | None,
        paused_at_ms: int | None,
        is_playing: bool,
    ) -> RoomPlayback: ...


class IRoomPlaybackRepo(IRoomPlaybackReader, IRoomPlaybackWriter, Protocol):
    """Full room_playback repository — composes reader + writer.

    Callers that genuinely need both sides (``RoomPlaybackService``)
    depend on this; everything else should narrow per Interface
    Segregation. Mirrors the ``IUserRepo`` precedent.
    """
