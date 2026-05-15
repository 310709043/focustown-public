from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.api.v1.tracks.schemas import TrackResponse

RoomTheme = Literal["dawn", "day", "dusk", "night", "rain", "snow", "storm"]
RoomVisibility = Literal["public", "invite_only"]


class RoomResponse(BaseModel):
    id: str
    owner_user_id: str
    name: str
    theme: RoomTheme
    visibility: RoomVisibility
    max_visitors: int
    created_at: datetime
    updated_at: datetime


class UpdateRoomRequest(BaseModel):
    """Partial update.

    Omitted fields are left untouched. ``name`` is trimmed in the service
    layer; ``theme`` is validated against the same whitelist as
    ``ALLOWED_THEMES`` in the domain layer (Pydantic ``Literal`` here is
    the wire-level guard, the service does the second check).
    """

    name: str | None = Field(default=None, min_length=1, max_length=64)
    theme: RoomTheme | None = None


class RoomItemResponse(BaseModel):
    id: str
    room_id: str
    user_item_id: str
    x: int
    y: int
    z_index: int
    created_at: datetime
    updated_at: datetime


class PlaceRoomItemRequest(BaseModel):
    """Body for ``POST /me/room/items``.

    ``x`` and ``y`` are integer percentages of the room interior bounding
    box (0–100). The service runs the same range check again as the
    second line of defense before the DB CHECK fires.
    """

    user_item_id: str = Field(..., min_length=1, max_length=36)
    x: int = Field(..., ge=0, le=100)
    y: int = Field(..., ge=0, le=100)


class MoveRoomItemRequest(BaseModel):
    """Body for ``PUT /me/room/items/{item_id}``.

    z_index reordering is reserved for a later stint; for now only the
    flat (x, y) position changes here.
    """

    x: int = Field(..., ge=0, le=100)
    y: int = Field(..., ge=0, le=100)


class AddRoomTrackRequest(BaseModel):
    track_id: str = Field(min_length=1, max_length=36)


class RoomTrackResponse(BaseModel):
    """Playlist entry — joins the join row with the embedded track metadata
    so the client doesn't need a follow-up round-trip per row."""

    id: str
    room_id: str
    track_id: str
    position: int
    track: TrackResponse


class RoomVisitResponse(BaseModel):
    """Active visitor session row (Phase 8).

    Returned by ``POST /rooms/{id}/visit`` and as elements of
    ``GET /rooms/{id}/visitors``. ``leave`` returns 204 (no body).
    """

    id: str
    room_id: str
    visitor_user_id: str
    joined_at: datetime


# ── Phase 9: shared playback timeline ──────────────────────────────────────


class PlaybackChangeRequest(BaseModel):
    """Body for ``POST /me/room/playback/change``.

    Switches the current track. Server validates that ``track_id``
    exists in the global tracks table; the playlist (room_tracks)
    constraint is enforced by the client UI (which only surfaces
    tracks already in the room's playlist).
    """

    track_id: str = Field(..., min_length=1, max_length=36)


class RoomPlaybackResponse(BaseModel):
    """The room's playback timeline state.

    Timestamps are epoch milliseconds so the frontend's drift loop can
    use ``Date.now()`` arithmetic without timezone parsing. ``track``
    is denormalized for one-shot hydration — visitors mounting fresh
    don't have to round-trip to ``tracksApi.get(current_track_id)``.
    """

    id: str
    room_id: str
    current_track_id: str | None
    started_at_ms: int | None
    paused_at_ms: int | None
    is_playing: bool
    track: TrackResponse | None
