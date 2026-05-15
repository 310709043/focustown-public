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
    is_official: bool = False


class ITrackRepo(Protocol):
    async def list(self, *, mood: str | None = None) -> list[TrackRecord]: ...
    async def list_official(self) -> list[TrackRecord]:
        """Personal-radio source: all rows where ``is_official`` is true.

        Returns the catalog in a stable order (id ASC). The order
        carries no audible meaning — ``PlaylistService`` re-shuffles
        per (user, context, date).
        """
        ...
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
        is_official: bool = False,
    ) -> TrackRecord: ...
    async def delete(self, *, track_id: str, user_id: str) -> None: ...
