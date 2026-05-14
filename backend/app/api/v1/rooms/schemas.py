from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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
