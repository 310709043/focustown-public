from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    character_key: str | None = Field(default=None, max_length=32)
    role_label: str | None = Field(default=None, max_length=64)


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    character_key: str | None = None
    role_label: str | None = None


class UserStatsResponse(BaseModel):
    """Dashboard stats for the signed-in user.

    Aggregated entirely from `focus_sessions` rows with
    ``status='completed' AND mode='focus'``. Brand-new accounts get an
    all-zero response (frontend renders ``—`` for ``weekly_rank == 0``).
    """

    total_tomatoes: int
    all_time_focus_hours: float
    week_total_hours: float
    streak_days: int
    weekly_rank: int
    heatmap: list[list[int]]
    level: int
    xp: int
    xp_next_level: int


class PublicUserProfile(BaseModel):
    """View of a user that is safe to expose to any authenticated viewer.

    Deliberately omits email, password_hash, terms / marketing flags, and
    is_bot — the rule of thumb is "would this field belong on a public
    leaderboard?" If no, it stays out of this schema.

    `today_focus_minutes` is derived from completed-pomodoro count * 25
    so the value lines up with what the leaderboard widget shows.
    Streak / all-time / level fields mirror the corresponding values
    from ``/users/me/stats`` for the target user — same DB-derived
    aggregates, no synthetic fill.
    """

    id: str
    display_name: str
    character_key: str | None = None
    role_label: str | None = None
    joined_at: datetime
    today_focus_minutes: int = 0
    streak_days: int = 0
    all_time_focus_hours: float = 0.0
    level: int = 1
    xp: int = 0
    xp_next_level: int = 0
