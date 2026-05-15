"""Unit tests for ITrackRepo behaviour using an in-memory fake.

V1 narrows ITrackRepo to a reader + seed-only writer: ``list`` / ``get`` /
``list_official`` for read paths (personal radio, library browse, stream
endpoint) and ``insert`` for the dev-data seeder. Tests follow suit.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

import pytest

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

    async def list_official(self) -> list[TrackRecord]:
        return sorted(
            (r for r in self._rows.values() if r.is_official),
            key=lambda r: r.id,
        )

    async def get(self, track_id: str) -> TrackRecord | None:
        return self._rows.get(track_id)

    async def get_many_by_ids(self, track_ids: list[str]) -> list[TrackRecord]:
        return [self._rows[tid] for tid in track_ids if tid in self._rows]

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
            is_official=is_official,
        )
        self._rows[track_id] = rec
        return rec


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
async def test_list_official_filters_and_sorts():
    repo = FakeTrackRepo()
    await _insert_demo(repo, track_id="t-b", file_key="b", is_official=True)
    await _insert_demo(repo, track_id="t-a", file_key="a", is_official=True)
    await _insert_demo(repo, track_id="t-c", file_key="c", is_official=False)

    official = await repo.list_official()
    assert [r.id for r in official] == ["t-a", "t-b"]


@pytest.mark.asyncio
async def test_get_missing_returns_none():
    repo = FakeTrackRepo()
    assert await repo.get("nope") is None
