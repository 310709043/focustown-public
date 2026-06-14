from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Overview ────────────────────────────────────────────────────────────


class OverviewStats(BaseModel):
    total_users: int
    active_today: int
    online_now: int

    sessions_today: int
    avg_duration_seconds: float

    match_queue_depth: int
    new_feedback_count: int


# ── Users ───────────────────────────────────────────────────────────────


class AdminUserItem(BaseModel):
    id: str
    email: str
    display_name: str
    character_key: str | None
    is_active: bool
    created_at: datetime
    last_focus_at: datetime | None


class AdminUserList(BaseModel):
    items: list[AdminUserItem]
    total: int
    page: int
    size: int


class BanResponse(BaseModel):
    id: str
    is_active: bool


# ── Feedback ────────────────────────────────────────────────────────────


class AdminFeedbackItem(BaseModel):
    id: str
    user_id: str | None
    category: str
    body: str
    contact_email: str | None
    status: str
    locale: str
    app_version: str | None
    created_at: datetime


class AdminFeedbackList(BaseModel):
    items: list[AdminFeedbackItem]
    total: int
    page: int
    size: int


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(pattern=r"^(new|reviewed|resolved)$")


class AdminFeedbackDetail(BaseModel):
    id: str
    status: str
    updated_at: datetime
