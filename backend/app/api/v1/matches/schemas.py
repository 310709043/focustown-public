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
    compatibility: int
    reason: str
    status: MatchStatus
    created_at: datetime
