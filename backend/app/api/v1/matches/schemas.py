from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

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


class MatchAutoMatchedResponse(BaseModel):
    """Returned from POST /matches/auto when the requester was paired
    immediately (another real user was already waiting, or no real users
    were online and a bot was auto-accepted via the sweep on enqueue).
    HTTP 201.
    """

    status: Literal["matched"] = "matched"
    via: Literal["waiting_pool", "bot_fallback"]
    match: MatchResponse


class MatchAutoWaitingResponse(BaseModel):
    """Returned from POST /matches/auto when the requester was placed in
    the waiting pool. The UI shows a "searching for a partner" state until
    a ``match.proposed`` WebSocket frame arrives (real-real pair) or until
    the per-user fallback deadline triggers a bot-fallback match (also
    delivered as ``match.proposed`` with ``via="bot_fallback"``).
    HTTP 202.
    """

    status: Literal["waiting"] = "waiting"
    enqueued_at_ms: int
    bot_fallback_at_ms: int


MatchAutoResponse = Annotated[
    MatchAutoMatchedResponse | MatchAutoWaitingResponse,
    Field(discriminator="status"),
]


class MatchQueueStatusResponse(BaseModel):
    """Returned from GET /matches/queue/me when the caller is in the
    waiting pool. Returns 404 with ``not_in_queue`` otherwise. The
    frontend uses this to rehydrate the modal after a reload — the
    in-memory store can't survive an F5."""

    status: Literal["waiting"] = "waiting"
    enqueued_at_ms: int
    bot_fallback_at_ms: int
