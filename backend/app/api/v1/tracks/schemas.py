from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


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
