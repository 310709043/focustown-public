from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TrackResponse(BaseModel):
    id: str
    title: str
    artist: str | None
    mood: str
    duration_ms: int | None
    content_type: str
    file_size_bytes: int
    license: str | None
    uploaded_by_user_id: str
    created_at: datetime


class TrackUploadMeta(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    artist: str | None = Field(default=None, max_length=255)
    mood: str = Field(min_length=1, max_length=32)
    license: str | None = Field(default=None, max_length=64)
