"""Unit tests for worker job coroutines.

Worth testing:
- ``refresh_bot_presence_job`` opens a DB session, hands a SqlUserRepo +
  tracker to the seeder, and awaits exactly one call. Without this, a
  silent refactor that drops the seeder call would let bot Redis presence
  decay every 90 seconds.
- ``_scope_id_from_pair_key`` strips the prefix correctly and rejects
  non-pair keys so a foreign key in the same Redis DB doesn't crash the
  pair-station SCAN loop.
- ``_log_job_errors`` runs the wrapped coroutine on the happy path and
  re-raises after logging on failure (APScheduler relies on the
  exception escaping to record the misfire).
- Every station job short-circuits BEFORE touching the factory when
  ``feat_shared_station`` is False — locks the operator-visible "feature
  off → zero side effects" contract.

NOT worth testing:
- ``main()`` orchestration — wiring of scheduler intervals is structural,
  any regression surfaces immediately on the next worker container start.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app import worker
from app.core.config import get_settings
from app.infrastructure.db.repositories import SqlUserRepo
from app.worker import (
    _log_job_errors,
    _scope_id_from_pair_key,
    advance_city_station,
    advance_pair_stations,
    snapshot_stations_to_db,
)


@pytest.mark.asyncio
async def test_refresh_bot_presence_job_invokes_seeder_once(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    async def _record_seeder(*, reader, tracker) -> int:
        calls.append({"reader": reader, "tracker": tracker})
        return 0

    sentinel_tracker = object()
    monkeypatch.setattr(worker, "refresh_bot_presence", _record_seeder)
    monkeypatch.setattr(worker, "get_redis", lambda: MagicMock())
    monkeypatch.setattr(
        worker, "RedisPresenceTracker", lambda *_a, **_kw: sentinel_tracker
    )

    fake_db = MagicMock()

    @asynccontextmanager
    async def fake_factory():
        yield fake_db

    await worker.refresh_bot_presence_job(fake_factory)

    assert len(calls) == 1
    assert calls[0]["tracker"] is sentinel_tracker
    assert isinstance(calls[0]["reader"], SqlUserRepo)


# ── logic — _scope_id_from_pair_key ────────────────────────────────────────


def test_scope_id_strips_pair_prefix() -> None:
    assert _scope_id_from_pair_key("station:pair:match-1") == "match-1"


def test_scope_id_handles_uuid_match_id() -> None:
    key = "station:pair:13d2bb7a-94fa-4f7c-82a3-57fbacd03d7c"
    assert _scope_id_from_pair_key(key) == "13d2bb7a-94fa-4f7c-82a3-57fbacd03d7c"


def test_scope_id_rejects_non_pair_key() -> None:
    # The SCAN pattern only matches station:pair:*, but defending against a
    # foreign key turning up keeps the loop from raising mid-iteration.
    assert _scope_id_from_pair_key("station:city:lowbatterytown") is None


def test_scope_id_rejects_unrelated_key() -> None:
    assert _scope_id_from_pair_key("user:alice") is None


# ── logic — _log_job_errors wrapper ────────────────────────────────────────


@pytest.mark.asyncio
async def test_log_job_errors_runs_coroutine_on_happy_path() -> None:
    calls: list[str] = []

    async def _ok() -> None:
        calls.append("ran")

    wrapped = _log_job_errors("job-x", _ok)
    await wrapped()

    assert calls == ["ran"]


@pytest.mark.asyncio
async def test_log_job_errors_reraises_after_logging() -> None:
    async def _boom() -> None:
        raise RuntimeError("intentional")

    wrapped = _log_job_errors("job-x", _boom)

    # APScheduler relies on the exception still escaping so the misfire
    # gets recorded. Swallowing here would hide it from operators.
    with pytest.raises(RuntimeError, match="intentional"):
        await wrapped()


# ── flag short-circuit — every station job is dark when off ────────────────


class _FactorySentinel:
    """If the job calls the factory we'll know — the short-circuit
    should return BEFORE any `async with factory()` runs."""

    called: bool = False

    def __call__(self) -> Any:
        type(self).called = True
        raise AssertionError("factory should not be invoked when flag is off")


@pytest.mark.asyncio
async def test_advance_city_station_short_circuits_when_flag_off() -> None:
    _FactorySentinel.called = False
    settings = get_settings()
    factory = _FactorySentinel()

    with patch.object(settings, "feat_shared_station", False):
        await advance_city_station(factory)

    assert _FactorySentinel.called is False


@pytest.mark.asyncio
async def test_advance_pair_stations_short_circuits_when_flag_off() -> None:
    _FactorySentinel.called = False
    settings = get_settings()
    factory = _FactorySentinel()

    with patch.object(settings, "feat_shared_station", False):
        await advance_pair_stations(factory)

    assert _FactorySentinel.called is False


@pytest.mark.asyncio
async def test_snapshot_stations_to_db_short_circuits_when_flag_off() -> None:
    _FactorySentinel.called = False
    settings = get_settings()
    factory = _FactorySentinel()

    with patch.object(settings, "feat_shared_station", False):
        await snapshot_stations_to_db(factory)

    assert _FactorySentinel.called is False
