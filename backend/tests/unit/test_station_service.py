"""Unit tests for ``StationService``.

The four-category checklist:

- **logic**: deterministic shuffle by (kind, scope_id, day); publishes a
  ``station.cursor`` envelope on every advance.
- **error**: empty official catalog raises ``BusinessError``.
- **boundary**: ``advance_if_due`` advances exactly at
  ``started_at_ms + duration``; one ms before is a no-op.
- **object-state**: after an advance, ``cursor_index`` increments
  modulo-N and ``version`` strictly grows; ``started_at_ms`` carries
  the exact track duration forward (not ``now_ms``) so late ticks do
  not drift.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest

from app.core.exceptions import BusinessError
from app.domain.models.station import StationCursor
from app.domain.services.station_service import StationService
from tests.unit.fakes import FakeClock, FakeTrackRepo, RecordingPublisher


@dataclass
class FakeStationCache:
    """In-memory mirror of ``RedisStationCache``.

    Duck-typed against the real class (the service depends on the
    concrete cache directly, mirroring how ``RoomPlaybackService``
    consumes its adapter). Pair TTL is irrelevant to logic, so we
    store cursors raw and accept the ``ex`` keyword arg as a no-op.
    """

    rows: dict[str, StationCursor] = field(default_factory=dict)

    @staticmethod
    def _key(kind: str, scope_id: str) -> str:
        return f"station:{kind}:{scope_id}"

    async def get(self, *, kind, scope_id):
        return self.rows.get(self._key(kind, scope_id))

    async def set(self, cursor):
        self.rows[self._key(cursor.kind, cursor.scope_id)] = cursor

    async def delete(self, *, kind, scope_id):
        self.rows.pop(self._key(kind, scope_id), None)


@dataclass
class FakeStationSnapshotRepo:
    """Composes IStationReader + IStationWriter for the service."""

    rows: dict[tuple[str, str], StationCursor] = field(default_factory=dict)

    async def get_snapshot(self, *, kind, scope_id):
        return self.rows.get((kind, scope_id))

    async def upsert_snapshot(self, cursor):
        self.rows[(cursor.kind, cursor.scope_id)] = cursor


def _clock() -> FakeClock:
    return FakeClock(current=datetime(2026, 5, 21, 12, 0, tzinfo=UTC))


async def _seed_tracks(repo: FakeTrackRepo, *, count: int, duration_ms: int) -> None:
    for i in range(count):
        await repo.insert(
            track_id=f"t-{i:02d}",
            title=f"Track {i}",
            artist=None,
            mood="lofi",
            duration_ms=duration_ms,
            file_key=f"tracks/t-{i}.mp3",
            content_type="audio/mpeg",
            file_size_bytes=1,
            license="seed",
            uploaded_by_user_id="system",
            is_official=True,
        )


def _make_service(
    *,
    tracks: FakeTrackRepo,
    cache: FakeStationCache | None = None,
    publisher: RecordingPublisher | None = None,
    clock: FakeClock | None = None,
) -> tuple[StationService, FakeStationCache, RecordingPublisher, FakeClock]:
    cache = cache or FakeStationCache()
    publisher = publisher or RecordingPublisher()
    clock = clock or _clock()
    snapshots = FakeStationSnapshotRepo()
    svc = StationService(
        cache=cache,  # type: ignore[arg-type]
        snapshots_reader=snapshots,
        snapshots_writer=snapshots,
        tracks=tracks,
        realtime=publisher,  # type: ignore[arg-type]
        clock=clock,
    )
    return svc, cache, publisher, clock


# ── logic ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_seed_is_deterministic_for_same_kind_scope_day() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=6, duration_ms=180_000)
    svc_a, _, _, _ = _make_service(tracks=repo)
    svc_b, _, _, _ = _make_service(tracks=repo)

    a = await svc_a.seed(kind="city", scope_id="lowbatterytown")
    b = await svc_b.seed(kind="city", scope_id="lowbatterytown")

    assert a.playlist_ids == b.playlist_ids
    assert a.seed == b.seed


@pytest.mark.asyncio
async def test_seed_publishes_station_cursor_event() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=3, duration_ms=180_000)
    svc, _, publisher, _ = _make_service(tracks=repo)

    await svc.seed(kind="city", scope_id="lowbatterytown")

    assert len(publisher.published) == 1
    channel, payload = publisher.published[0]
    assert channel == "station:city:lowbatterytown"
    assert payload["type"] == "station.cursor"
    assert payload["cursor_index"] == 0


@pytest.mark.asyncio
async def test_seed_differs_between_kinds_for_same_scope() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=8, duration_ms=180_000)
    svc_city, _, _, _ = _make_service(tracks=repo)
    svc_pair, _, _, _ = _make_service(tracks=repo)

    city = await svc_city.seed(kind="city", scope_id="x")
    pair = await svc_pair.seed(kind="pair", scope_id="x")

    assert city.playlist_ids != pair.playlist_ids


# ── error ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_seed_with_empty_catalog_raises() -> None:
    repo = FakeTrackRepo()
    svc, _, _, _ = _make_service(tracks=repo)

    with pytest.raises(BusinessError) as exc:
        await svc.seed(kind="city", scope_id="lowbatterytown")

    assert "no_tracks_available" in str(exc.value)


# ── boundary ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_advance_if_due_at_exact_track_end_advances() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=3, duration_ms=180_000)
    svc, cache, publisher, _ = _make_service(tracks=repo)
    seeded = await svc.seed(kind="city", scope_id="x")
    publisher.published.clear()
    end_ms = seeded.started_at_ms + 180_000

    advanced = await svc.advance_if_due(kind="city", scope_id="x", now_ms=end_ms)

    assert advanced is not None
    assert advanced.cursor_index == 1
    assert len(publisher.published) == 1


@pytest.mark.asyncio
async def test_advance_if_due_one_ms_before_track_end_is_noop() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=3, duration_ms=180_000)
    svc, _, publisher, _ = _make_service(tracks=repo)
    seeded = await svc.seed(kind="city", scope_id="x")
    publisher.published.clear()
    just_before = seeded.started_at_ms + 180_000 - 1

    advanced = await svc.advance_if_due(kind="city", scope_id="x", now_ms=just_before)

    assert advanced is None
    assert publisher.published == []


# ── object-state ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_advance_carries_duration_into_started_at_no_drift() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=3, duration_ms=180_000)
    svc, _, _, _ = _make_service(tracks=repo)
    seeded = await svc.seed(kind="city", scope_id="x")
    # Late tick — worker ran 4s behind schedule.
    late_now = seeded.started_at_ms + 180_000 + 4_000

    advanced = await svc.advance_if_due(kind="city", scope_id="x", now_ms=late_now)

    assert advanced is not None
    # The new anchor is the EXACT track-end of the previous track, not
    # ``late_now``. Re-anchoring to ``late_now`` would drift the shared
    # playhead by 4s on every late tick.
    assert advanced.started_at_ms == seeded.started_at_ms + 180_000


@pytest.mark.asyncio
async def test_advance_wraps_cursor_modulo_playlist_length() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=3, duration_ms=180_000)
    svc, _, _, _ = _make_service(tracks=repo)
    seeded = await svc.seed(kind="city", scope_id="x")

    # Drive through three advances to wrap back to index 0.
    cursor = seeded
    for _ in range(3):
        end_ms = cursor.started_at_ms + 180_000
        next_cursor = await svc.advance_if_due(
            kind="city", scope_id="x", now_ms=end_ms
        )
        assert next_cursor is not None
        cursor = next_cursor

    assert cursor.cursor_index == 0
    assert cursor.version == 3


@pytest.mark.asyncio
async def test_get_current_falls_back_to_snapshot_then_seed() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=4, duration_ms=180_000)
    svc, cache, _, _ = _make_service(tracks=repo)

    # Cold-start: no Redis, no snapshot → seeds and caches.
    first = await svc.get_current(kind="city", scope_id="x")
    assert first.cursor_index == 0
    assert await cache.get(kind="city", scope_id="x") is not None

    # Second call hits the cache, returns the same cursor.
    second = await svc.get_current(kind="city", scope_id="x")
    assert second == first


@pytest.mark.asyncio
async def test_get_current_hits_db_snapshot_when_redis_is_cold() -> None:
    """Crash-recovery path: Redis was evicted but a snapshot survives.

    Without this branch, every Redis restart would mid-song teleport
    every connected listener back to track[0]. The snapshot lets the
    next ``get_current`` re-anchor near where everyone was.
    """
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=3, duration_ms=180_000)
    svc, cache, _, _ = _make_service(tracks=repo)

    snapshot = StationCursor(
        kind="city",
        scope_id="x",
        playlist_ids=["t-00", "t-01", "t-02"],
        cursor_index=1,
        started_at_ms=1_234_000,
        seed=42,
        version=7,
    )
    # Pre-load only the snapshot repo (the cache stays cold).
    await svc.snapshots_writer.upsert_snapshot(snapshot)

    restored = await svc.get_current(kind="city", scope_id="x")

    # The snapshot was returned (not a fresh seed at index 0).
    assert restored.cursor_index == 1
    assert restored.version == 7
    # And the cache is now warm so subsequent reads hit Redis directly.
    cached = await cache.get(kind="city", scope_id="x")
    assert cached is not None
    assert cached.cursor_index == 1


@pytest.mark.asyncio
async def test_snapshot_to_db_no_op_when_cache_is_empty() -> None:
    """Defensive snapshot path: the worker runs every 5min on a schedule.

    If a scope hasn't been seeded yet (no one's joined the city today),
    the snapshot tick must NOT insert a phantom row.
    """
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=2, duration_ms=180_000)
    svc, _, _, _ = _make_service(tracks=repo)
    fake_writer = svc.snapshots_writer
    assert isinstance(fake_writer, FakeStationSnapshotRepo)

    await svc.snapshot_to_db(kind="city", scope_id="never-seeded")

    assert fake_writer.rows == {}


@pytest.mark.asyncio
async def test_cleanup_pair_removes_redis_key() -> None:
    repo = FakeTrackRepo()
    await _seed_tracks(repo, count=2, duration_ms=180_000)
    svc, cache, _, _ = _make_service(tracks=repo)
    await svc.seed(kind="pair", scope_id="match-1")
    assert await cache.get(kind="pair", scope_id="match-1") is not None

    await svc.cleanup_pair(match_id="match-1")

    assert await cache.get(kind="pair", scope_id="match-1") is None
