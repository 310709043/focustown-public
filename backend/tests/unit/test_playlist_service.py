"""Unit tests for ``PlaylistService``.

The four-category checklist:

- **logic**: deterministic shuffle, drawn only from official rows.
- **error**: unknown context raises ``BusinessError``.
- **boundary**: empty catalog returns ``[]`` rather than raising.
- **object-state**: same (user, context, day) → identical list across
  calls; differing user / context / day produces a different list.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import BusinessError
from app.domain.services.playlist_service import PlaylistService
from tests.unit.fakes import FakeClock, FakeTrackRepo


def _clock() -> FakeClock:
    return FakeClock(current=datetime(2026, 5, 16, 12, 0, tzinfo=UTC))


async def _seed_catalog(
    repo: FakeTrackRepo, *, official: int, unofficial: int
) -> None:
    for i in range(official):
        await repo.insert(
            track_id=f"o-{i:02d}",
            title=f"Official {i}",
            artist=None,
            mood="lofi",
            duration_ms=180_000,
            file_key=f"tracks/o-{i}.mp3",
            content_type="audio/mpeg",
            file_size_bytes=1,
            license="royalty-free-seed",
            uploaded_by_user_id="system",
            is_official=True,
        )
    for i in range(unofficial):
        await repo.insert(
            track_id=f"u-{i:02d}",
            title=f"User {i}",
            artist=None,
            mood="lofi",
            duration_ms=180_000,
            file_key=f"tracks/u-{i}.mp3",
            content_type="audio/mpeg",
            file_size_bytes=1,
            license=None,
            uploaded_by_user_id="alice",
            is_official=False,
        )


# ── logic ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_personal_playlist_draws_only_from_official_catalog() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=4, unofficial=10)
    svc = PlaylistService(tracks=repo, clock=_clock())

    out = await svc.get_personal_playlist(user_id="alice", context="city")

    assert {t.id for t in out} == {f"o-{i:02d}" for i in range(4)}


@pytest.mark.asyncio
async def test_personal_playlist_is_deterministic_for_same_seed() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=8, unofficial=0)
    svc = PlaylistService(tracks=repo, clock=_clock())

    first = await svc.get_personal_playlist(user_id="alice", context="city")
    second = await svc.get_personal_playlist(user_id="alice", context="city")

    assert [t.id for t in first] == [t.id for t in second]


# ── object-state ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_personal_playlist_differs_between_users() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=8, unofficial=0)
    svc = PlaylistService(tracks=repo, clock=_clock())

    alice = await svc.get_personal_playlist(user_id="alice", context="city")
    bob = await svc.get_personal_playlist(user_id="bob", context="city")

    # Same catalog but different ordering (~probability 1/8! of false fail
    # is small enough to ignore for a deterministic seed).
    assert [t.id for t in alice] != [t.id for t in bob]


@pytest.mark.asyncio
async def test_personal_playlist_differs_between_contexts() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=8, unofficial=0)
    svc = PlaylistService(tracks=repo, clock=_clock())

    city = await svc.get_personal_playlist(user_id="alice", context="city")
    focus = await svc.get_personal_playlist(user_id="alice", context="focus")

    assert [t.id for t in city] != [t.id for t in focus]


@pytest.mark.asyncio
async def test_personal_playlist_differs_between_context_ids() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=8, unofficial=0)
    svc = PlaylistService(tracks=repo, clock=_clock())

    a = await svc.get_personal_playlist(
        user_id="alice", context="room", context_id="room-a"
    )
    b = await svc.get_personal_playlist(
        user_id="alice", context="room", context_id="room-b"
    )

    assert [t.id for t in a] != [t.id for t in b]


@pytest.mark.asyncio
async def test_personal_playlist_differs_across_days() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=8, unofficial=0)
    clock = _clock()
    svc = PlaylistService(tracks=repo, clock=clock)

    day_one = await svc.get_personal_playlist(user_id="alice", context="city")
    clock.advance(timedelta(days=1))
    day_two = await svc.get_personal_playlist(user_id="alice", context="city")

    assert [t.id for t in day_one] != [t.id for t in day_two]


# ── boundary ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_personal_playlist_empty_official_catalog_returns_empty_list() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=0, unofficial=5)
    svc = PlaylistService(tracks=repo, clock=_clock())

    out = await svc.get_personal_playlist(user_id="alice", context="city")

    assert out == []


# ── error ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_personal_playlist_unknown_context_raises() -> None:
    repo = FakeTrackRepo()
    await _seed_catalog(repo, official=1, unofficial=0)
    svc = PlaylistService(tracks=repo, clock=_clock())

    with pytest.raises(BusinessError) as exc:
        await svc.get_personal_playlist(user_id="alice", context="library")

    assert "unknown_context" in str(exc.value)
