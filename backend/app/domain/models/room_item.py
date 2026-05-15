from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

MAX_PCT = 100
MIN_PCT = 0


@dataclass(slots=True)
class RoomItem:
    id: str
    room_id: str
    user_item_id: str
    x: int
    y: int
    z_index: int
    created_at: datetime
    updated_at: datetime
