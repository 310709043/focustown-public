from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True)
class TrackRecord:
    id: str
    title: str
    artist: str | None
    mood: str
    duration_ms: int | None
    file_key: str
    content_type: str
    file_size_bytes: int
    license: str | None
    uploaded_by_user_id: str
    created_at: datetime
    updated_at: datetime


class ITrackRepo(Protocol):
    async def list(self, *, mood: str | None = None) -> list[TrackRecord]: ...
    async def get(self, track_id: str) -> TrackRecord | None: ...
    async def count_by_uploader(self, user_id: str) -> int: ...
    async def insert(
        self,
        *,
        track_id: str,
        title: str,
        artist: str | None,
        mood: str,
        duration_ms: int | None,
        file_key: str,
        content_type: str,
        file_size_bytes: int,
        license: str | None,
        uploaded_by_user_id: str,
    ) -> TrackRecord: ...
    async def delete(self, *, track_id: str, user_id: str) -> None: ...
