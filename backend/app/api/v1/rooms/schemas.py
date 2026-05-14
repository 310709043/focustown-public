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
