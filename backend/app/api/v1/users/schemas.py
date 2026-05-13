from __future__ import annotations

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
