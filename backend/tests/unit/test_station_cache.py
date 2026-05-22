"""Unit tests for ``RedisStationCache``.

Worth testing — these rules govern the live cursor for shared cohort
stations, the source-of-truth that drives synchronised playback for
every user in the same scope:

- ``get`` returns a fully-typed ``StationCursor`` round-tripped from JSON
- ``get`` returns ``None`` on miss (worker SCAN can encounter a key that
  was deleted between SCAN cursor batches)
- ``set`` for ``kind=city`` writes WITHOUT a TTL — the city never goes
  away; an evicted city key would silently reset every connected
  listener to track[0]
- ``set`` for ``kind=pair`` writes WITH a 6h sliding TTL refreshed on
  every advance — abandoned matches GC themselves without a sweep job
- ``delete`` issues a single ``DEL station:{kind}:{scope_id}``
- ``scan_pair_keys`` yields each ``station:pair:*`` key with no extra
  filtering (the worker tolerates a foreign key showing up; this just
  surfaces them faithfully)
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.domain.models.station import StationCursor
from app.infrastructure.cache.station_cache import RedisStationCache


def _cursor(kind: str = "city", scope_id: str = "lowbatterytown") -> StationCursor:
    return StationCursor(
        kind=kind,  # type: ignore[arg-type]
        scope_id=scope_id,
        playlist_ids=["t-1", "t-2", "t-3"],
        cursor_index=2,
        started_at_ms=1_700_000_000_000,
        seed=42,
        version=7,
    )


# ── logic — get ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_round_trips_a_cursor_from_json() -> None:
    cursor = _cursor()
    redis = MagicMock()
    redis.get = AsyncMock(
        return_value=json.dumps(
            {
                "kind": cursor.kind,
                "scope_id": cursor.scope_id,
                "playlist_ids": cursor.playlist_ids,
                "cursor_index": cursor.cursor_index,
                "started_at_ms": cursor.started_at_ms,
                "seed": cursor.seed,
                "version": cursor.version,
            }
        )
    )
    cache = RedisStationCache(redis)

    out = await cache.get(kind="city", scope_id="lowbatterytown")

    redis.get.assert_awaited_once_with("station:city:lowbatterytown")
    assert out == cursor


@pytest.mark.asyncio
async def test_get_returns_none_on_miss_without_raising() -> None:
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    cache = RedisStationCache(redis)

    out = await cache.get(kind="city", scope_id="lowbatterytown")

    assert out is None


# ── logic + object-state — set respects TTL rules per kind ─────────────────


@pytest.mark.asyncio
async def test_set_for_city_writes_without_a_ttl() -> None:
    redis = MagicMock()
    redis.set = AsyncMock()
    cache = RedisStationCache(redis)

    await cache.set(_cursor(kind="city", scope_id="lowbatterytown"))

    # SET with no `ex=` kwarg — the city key must never expire.
    redis.set.assert_awaited_once()
    args, kwargs = redis.set.await_args.args, redis.set.await_args.kwargs
    assert args[0] == "station:city:lowbatterytown"
    assert "ex" not in kwargs


@pytest.mark.asyncio
async def test_set_for_pair_attaches_the_sliding_6h_ttl() -> None:
    redis = MagicMock()
    redis.set = AsyncMock()
    cache = RedisStationCache(redis)

    await cache.set(_cursor(kind="pair", scope_id="match-7"))

    # SET with `ex=21600` — abandoned matches GC themselves after 6h
    # without a server sweep.
    redis.set.assert_awaited_once()
    args, kwargs = redis.set.await_args.args, redis.set.await_args.kwargs
    assert args[0] == "station:pair:match-7"
    assert kwargs.get("ex") == 6 * 60 * 60


@pytest.mark.asyncio
async def test_set_payload_is_json_with_every_cursor_field() -> None:
    redis = MagicMock()
    redis.set = AsyncMock()
    cache = RedisStationCache(redis)
    cursor = _cursor()

    await cache.set(cursor)

    body = redis.set.await_args.args[1]
    payload = json.loads(body)
    assert payload == {
        "kind": cursor.kind,
        "scope_id": cursor.scope_id,
        "playlist_ids": cursor.playlist_ids,
        "cursor_index": cursor.cursor_index,
        "started_at_ms": cursor.started_at_ms,
        "seed": cursor.seed,
        "version": cursor.version,
    }


# ── logic — delete ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_issues_a_single_del_on_the_scoped_key() -> None:
    redis = MagicMock()
    redis.delete = AsyncMock()
    cache = RedisStationCache(redis)

    await cache.delete(kind="pair", scope_id="match-7")

    redis.delete.assert_awaited_once_with("station:pair:match-7")


# ── object-state — scan_pair_keys streams every pair key ───────────────────


@pytest.mark.asyncio
async def test_scan_pair_keys_yields_every_key_from_the_scan_cursor() -> None:
    found_keys = [
        "station:pair:match-1",
        "station:pair:match-2",
        "station:pair:match-3",
    ]

    async def _scan_iter(*, match: str) -> AsyncIterator[str]:
        assert match == "station:pair:*"
        for k in found_keys:
            yield k

    redis = MagicMock()
    redis.scan_iter = _scan_iter
    cache = RedisStationCache(redis)

    collected = [k async for k in cache.scan_pair_keys()]

    assert collected == found_keys
