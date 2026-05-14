from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

RoomVisibility = Literal["public", "invite_only"]

ALLOWED_THEMES: frozenset[str] = frozenset(
    {"dawn", "day", "dusk", "night", "rain", "snow", "storm"}
)
DEFAULT_THEME = "night"
DEFAULT_VISIBILITY: RoomVisibility = "public"
DEFAULT_MAX_VISITORS = 5
MAX_ROOM_NAME_LEN = 64


@dataclass(slots=True)
class Room:
    id: str
    owner_user_id: str
    name: str
    theme: str
    visibility: RoomVisibility
    max_visitors: int
    created_at: datetime
    updated_at: datetime
