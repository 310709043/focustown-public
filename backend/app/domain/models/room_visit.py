from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True, frozen=True)
class RoomVisit:
    """An active "user is currently in room X" session.

    Frozen because in-flight rows are conceptually immutable: a state
    transition is delete + recreate, not field mutation.
    """

    id: str
    room_id: str
    visitor_user_id: str
    joined_at: datetime
