from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportReason = Literal["harassment", "sexual", "minor", "spam", "self_harm", "other"]
ReportStatus = Literal["open", "reviewed", "actioned", "dismissed"]


class GuestSessionResponse(BaseModel):
    guest_id: str
    token: str
    expires_at: datetime


class TownStatusResponse(BaseModel):
    online: int
    waiting: int
    open: bool
    hours: str = Field(description='Opening hours as "HH:MM-HH:MM", empty when always open')


class ReportCreate(BaseModel):
    reason: ReportReason
    note: str | None = Field(default=None, max_length=500)


class ReportCreated(BaseModel):
    id: str


class AdminLbtReportItem(BaseModel):
    id: str
    conversation_id: str
    reporter_guest_id: str
    reported_guest_id: str
    reason: str
    note: str | None
    transcript: list[dict[str, str]]
    reporter_profile: dict[str, object]
    reported_profile: dict[str, object]
    status: str
    created_at: datetime


class AdminLbtReportList(BaseModel):
    items: list[AdminLbtReportItem]


class AdminLbtReportStatusUpdate(BaseModel):
    status: ReportStatus
