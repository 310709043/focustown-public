from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class SessionStarted:
    session_id: str
    user_id: str
    partner_user_id: str | None
    started_at: datetime


@dataclass(slots=True)
class SessionCompleted:
    session_id: str
    user_id: str
    partner_user_id: str | None
    duration_seconds: int
    ended_at: datetime


@dataclass(slots=True)
class SessionAbandoned:
    session_id: str
    user_id: str
    ended_at: datetime


__all__ = [
    "SessionAbandoned",
    "SessionCompleted",
    "SessionStarted",
]
