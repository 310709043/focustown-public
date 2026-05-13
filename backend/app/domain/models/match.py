from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class MatchStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    SKIPPED = "skipped"
    EXPIRED = "expired"


@dataclass(slots=True)
class Match:
    id: str
    requester_id: str
    candidate_id: str
    compatibility: int  # 0..100
    reason: str
    status: MatchStatus
    created_at: datetime
    updated_at: datetime
