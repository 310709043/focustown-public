"""Unit tests for worker job coroutines.

Worth testing:
- ``refresh_bot_presence_job`` opens a DB session, hands a SqlUserRepo +
  tracker to the seeder, and awaits exactly one call. Without this, a
  silent refactor that drops the seeder call would let bot Redis presence
  decay every 90 seconds.

NOT worth testing:
- ``main()`` orchestration — wiring of scheduler intervals is structural,
  any regression surfaces immediately on the next worker container start.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import MagicMock

import pytest

from app import worker
from app.infrastructure.db.repositories import SqlUserRepo


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
