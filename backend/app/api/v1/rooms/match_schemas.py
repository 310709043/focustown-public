from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

MatchRoomStatusDTO = Literal["open", "both_joined", "active", "ended"]
RoomParticipantRoleDTO = Literal["requester", "candidate"]


class RoomParticipantResponse(BaseModel):
    """One participant row in the room snapshot.

    ``focus_session_id`` is null until Phase 08 links the session
    started inside the room. The frontend uses ``joined_at`` /
    ``left_at`` nullity to drive the "Waiting for partner" gating —
    treat any non-null ``joined_at`` as "this side has arrived".
    """

    user_id: str
    role: RoomParticipantRoleDTO
    joined_at: datetime | None
    left_at: datetime | None
    focus_session_id: str | None


class MatchRoomResponse(BaseModel):
    """Snapshot returned by GET / join / leave on the match-room.

    Both rows of ``participants`` are always present (the upsert
    contract guarantees two rows post-accept), ordered with the
    requester first so the wire shape matches the original match's
    requester / candidate orientation.
    """

    id: str
    match_id: str
    status: MatchRoomStatusDTO
    opened_at: datetime
    activated_at: datetime | None
    ended_at: datetime | None
    ended_reason: str | None
    participants: list[RoomParticipantResponse]
