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


class PublicUserProfile(BaseModel):
    """View of a user that is safe to expose to any authenticated viewer.

    Deliberately omits email, password_hash, terms / marketing flags, and
    is_bot — the rule of thumb is "would this field belong on a public
    leaderboard?" If no, it stays out of this schema.

    `today_focus_minutes` is derived from completed-pomodoro count × 25
    so the value lines up with what the leaderboard widget shows.
    """

    id: str
    display_name: str
    character_key: str | None = None
    role_label: str | None = None
    joined_at: datetime
    today_focus_minutes: int = 0
