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
    """V1 is a seeded-only catalog: routes read tracks (list/get/stream)
    but never mutate them. ``insert`` stays so the dev-data seeder can
    publish the official library; user-facing writes (upload/delete) were
    removed when V1 closed user uploads and will return via a new
    interface (with consent / report flow) when re-opened.
    """

    async def list(self, *, mood: str | None = None) -> list[TrackRecord]: ...
    async def list_official(self) -> list[TrackRecord]:
        """Personal-radio source: all rows where ``is_official`` is true.

        Returns the catalog in a stable order (id ASC). The order
        carries no audible meaning — ``PlaylistService`` re-shuffles
        per (user, context, date).
        """
        ...
    async def get(self, track_id: str) -> TrackRecord | None: ...
    async def get_many_by_ids(self, track_ids: list[str]) -> list[TrackRecord]:
        """Batch-fetch by id for hydrating join tables (e.g. room playlist)
        in one query instead of N. Order of the returned list is not
        guaranteed to match the input — callers should index by id.
        """
        ...
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
