"""Unit tests for ITrackRepo behaviour using an in-memory fake.

The fake mirrors SqlTrackRepo's contract (list filter, count, ownership-checked
delete). It keeps tests fast and DB-free; the SQL repo is exercised by
integration smoke tests separately.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError
from app.domain.repositories.track_repo import ITrackRepo, TrackRecord


class FakeTrackRepo(ITrackRepo):
    def __init__(self) -> None:
        self._rows: dict[str, TrackRecord] = {}

    async def list(self, *, mood: str | None = None) -> list[TrackRecord]:
        rows = list(self._rows.values())
        if mood is not None:
            rows = [r for r in rows if r.mood == mood]
        rows.sort(key=lambda r: r.created_at, reverse=True)
        return rows

    async def get(self, track_id: str) -> TrackRecord | None:
        return self._rows.get(track_id)

    async def count_by_uploader(self, user_id: str) -> int:
        return sum(1 for r in self._rows.values() if r.uploaded_by_user_id == user_id)

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
    ) -> TrackRecord:
        now = datetime.now(UTC)
        rec = TrackRecord(
            id=track_id,
            title=title,
            artist=artist,
            mood=mood,
            duration_ms=duration_ms,
            file_key=file_key,
            content_type=content_type,
            file_size_bytes=file_size_bytes,
            license=license,
            uploaded_by_user_id=uploaded_by_user_id,
            created_at=now,
            updated_at=now,
        )
        self._rows[track_id] = rec
        return rec

    async def delete(self, *, track_id: str, user_id: str) -> None:
        row = self._rows.get(track_id)
        if row is None:
            raise NotFoundError("track_not_found")
        if row.uploaded_by_user_id != user_id:
            raise ForbiddenError("track_not_owned")
        del self._rows[track_id]


async def _insert_demo(repo: ITrackRepo, **kwargs) -> TrackRecord:
    base = {
        "track_id": "t-1",
        "title": "demo",
        "artist": None,
        "mood": "lofi",
        "duration_ms": None,
        "file_key": "tracks/t-1.mp3",
        "content_type": "audio/mpeg",
        "file_size_bytes": 1024,
        "license": None,
        "uploaded_by_user_id": "u-1",
    }
    base.update(kwargs)
    return await repo.insert(**cast(dict, base))


@pytest.mark.asyncio
async def test_insert_and_get_roundtrip():
    repo = FakeTrackRepo()
    rec = await _insert_demo(repo)
    fetched = await repo.get(rec.id)
    assert fetched is not None
    assert fetched.title == "demo"
    assert fetched.mood == "lofi"


@pytest.mark.asyncio
async def test_list_filters_by_mood():
    repo = FakeTrackRepo()
    await _insert_demo(repo, track_id="t-lofi", mood="lofi", file_key="k1")
    await _insert_demo(repo, track_id="t-jazz", mood="jazz", file_key="k2")
    await _insert_demo(repo, track_id="t-rain", mood="rain", file_key="k3")

    all_rows = await repo.list()
    lofi_rows = await repo.list(mood="lofi")

    assert len(all_rows) == 3
    assert len(lofi_rows) == 1
    assert lofi_rows[0].id == "t-lofi"


@pytest.mark.asyncio
async def test_count_by_uploader():
    repo = FakeTrackRepo()
    await _insert_demo(repo, track_id="a1", uploaded_by_user_id="u-1", file_key="a1")
    await _insert_demo(repo, track_id="a2", uploaded_by_user_id="u-1", file_key="a2")
    await _insert_demo(repo, track_id="b1", uploaded_by_user_id="u-2", file_key="b1")

    assert await repo.count_by_uploader("u-1") == 2
    assert await repo.count_by_uploader("u-2") == 1
    assert await repo.count_by_uploader("u-3") == 0


@pytest.mark.asyncio
async def test_delete_owned_succeeds():
    repo = FakeTrackRepo()
    rec = await _insert_demo(repo)
    await repo.delete(track_id=rec.id, user_id="u-1")
    assert await repo.get(rec.id) is None


@pytest.mark.asyncio
async def test_delete_other_users_track_forbidden():
    repo = FakeTrackRepo()
    rec = await _insert_demo(repo)
    with pytest.raises(ForbiddenError):
        await repo.delete(track_id=rec.id, user_id="u-other")
    # Still present
    assert await repo.get(rec.id) is not None


@pytest.mark.asyncio
async def test_delete_missing_track_not_found():
    repo = FakeTrackRepo()
    with pytest.raises(NotFoundError):
        await repo.delete(track_id="does-not-exist", user_id="u-1")


@pytest.mark.asyncio
async def test_get_missing_returns_none():
    repo = FakeTrackRepo()
    assert await repo.get("nope") is None
