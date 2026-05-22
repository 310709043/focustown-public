from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MatchRoomStatusDTO = Literal["open", "both_joined", "active", "ended"]
RoomParticipantRoleDTO = Literal["requester", "candidate"]

# 25 minutes — the canonical Pomodoro focus length, matching the
# FocusSessionMode.FOCUS default in domain/models/focus_session.py.
# Kept in the schema (not service) so the client can override per-request
# inside the standard ``[60s, 3h]`` bounds.
_DEFAULT_FOCUS_DURATION_SECONDS = 25 * 60


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
    """Snapshot returned by GET / join / leave / start on the match-room.

    Both rows of ``participants`` are always present (the upsert
    contract guarantees two rows post-accept), ordered with the
    requester first so the wire shape matches the original match's
    requester / candidate orientation.

    Phase 08 adds the ``timer_*`` fields — populated only while the
    room is ``active`` so a mid-session reload restores the countdown
    via the snapshot endpoint (without these the UI shows "0:00" for
    up to one tick interval).
    """

    id: str
    match_id: str
    status: MatchRoomStatusDTO
    opened_at: datetime
    activated_at: datetime | None
    ended_at: datetime | None
    ended_reason: str | None
    participants: list[RoomParticipantResponse]
    timer_started_at: datetime | None = None
    timer_duration_seconds: int | None = None
    timer_remaining_seconds: int | None = None
    timer_expected_end_at: datetime | None = None


class StartMatchRoomRequest(BaseModel):
    """Body for ``POST /rooms/match/{match_id}/start``.

    ``duration_seconds`` mirrors the bounds used by the standalone focus
    session endpoint so a client building the shared-room UI on top of
    the existing duration picker doesn't need a second validator.
    """

    duration_seconds: int = Field(
        default=_DEFAULT_FOCUS_DURATION_SECONDS,
        ge=60,
        le=3 * 3600,
    )
