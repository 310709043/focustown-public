from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.domain.models import MatchStatus


class ProposeMatchRequest(BaseModel):
    candidate_id: str


class MatchResponse(BaseModel):
    id: str
    requester_id: str
    candidate_id: str
    requester_character_key: str | None = None
    candidate_character_key: str | None = None
    compatibility: int
    reason: str
    status: MatchStatus
    created_at: datetime
