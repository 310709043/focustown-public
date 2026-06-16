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
    active_sessions: int = 0

    match_queue_depth: int
    matches_today: int = 0
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


# ── Sessions ────────────────────────────────────────────────────────────


class AdminSessionItem(BaseModel):
    id: str
    user_id: str
    user_display_name: str | None
    mode: str
    duration_seconds: int
    elapsed_seconds: int
    status: str
    task_label: str | None
    started_at: datetime
    ended_at: datetime | None


class AdminSessionList(BaseModel):
    items: list[AdminSessionItem]
    total: int
    page: int
    size: int


class AdminSessionForceEnd(BaseModel):
    id: str
    status: str
    already_ended: bool


# ── Economy ─────────────────────────────────────────────────────────────


class AdminWalletTxItem(BaseModel):
    id: str
    user_id: str
    user_display_name: str | None
    currency_code: str
    delta_minor: int
    reason: str
    balance_after_minor: int
    created_at: datetime


class AdminWalletTxList(BaseModel):
    items: list[AdminWalletTxItem]
    total: int
    page: int
    size: int


class AdminWalletDistributionBucket(BaseModel):
    label: str
    count: int


class AdminWalletDistribution(BaseModel):
    total_supply_minor: int
    holder_count: int
    buckets: list[AdminWalletDistributionBucket]


# ── Matches ─────────────────────────────────────────────────────────────


class AdminMatchItem(BaseModel):
    id: str
    requester_id: str
    requester_name: str | None
    candidate_id: str
    candidate_name: str | None
    compatibility: int
    status: str
    created_at: datetime


class AdminMatchList(BaseModel):
    items: list[AdminMatchItem]
    total: int
    page: int
    size: int


# ── Chat Messages ──────────────────────────────────────────────────────


class AdminMessageItem(BaseModel):
    id: str
    match_id: str
    sender_id: str
    sender_name: str | None
    kind: str
    body: str
    created_at: datetime


class AdminMessageList(BaseModel):
    items: list[AdminMessageItem]
    total: int
    page: int
    size: int


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


# ── Announcements ──────────────────────────────────────────────────────


class AdminAnnouncementItem(BaseModel):
    id: str
    title: str
    body: str
    is_active: bool
    created_at: datetime


class AdminAnnouncementList(BaseModel):
    items: list[AdminAnnouncementItem]
    total: int
    page: int
    size: int


class AdminAnnouncementCreate(BaseModel):
    title: str = Field(max_length=256)
    body: str


class AdminAnnouncementUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    is_active: bool | None = None
