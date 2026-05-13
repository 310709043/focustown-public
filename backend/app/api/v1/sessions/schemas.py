from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.models import FocusSessionMode, FocusSessionStatus


class StartSessionRequest(BaseModel):
    mode: FocusSessionMode = FocusSessionMode.FOCUS
    duration_seconds: int | None = Field(default=None, ge=60, le=3 * 3600)
    task_label: str | None = Field(default=None, max_length=256)
    partner_user_id: str | None = None


class FocusSessionResponse(BaseModel):
    id: str
    user_id: str
    partner_user_id: str | None
    mode: FocusSessionMode
    duration_seconds: int
    elapsed_seconds: int
    remaining_seconds: int
    status: FocusSessionStatus
    task_label: str | None
    started_at: datetime
    ended_at: datetime | None
