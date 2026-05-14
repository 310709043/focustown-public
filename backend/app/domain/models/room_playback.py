from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True, frozen=True)
class RoomPlayback:
    """The shared playback timeline for a single room.

    Frozen because state mutations are upsert-based: the service builds
    a new RoomPlayback and the writer overwrites the row keyed by
    ``room_id``. Field mutation in place would obscure that contract.

    Timeline fields are epoch milliseconds (Date.now() compatible)
    rather than ``datetime`` so the frontend's drift loop can do plain
    arithmetic without timezone parsing.
    """

    id: str
    room_id: str
    current_track_id: str | None
    started_at_ms: int | None
    paused_at_ms: int | None
    is_playing: bool
