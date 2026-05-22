"""Unit tests for ``acquire_or_skip``.

Worth testing:
- Happy path: ``SET NX EX`` returns truthy → helper returns True.
- Contention path: ``SET NX EX`` returns None (key already held) →
  helper returns False. This is the assertion that pins the "at most
  one body per tick" contract; a refactor that swallows the None
  collapses the gate.
- TTL rounding: sub-second TTLs round UP, never to 0. A 0-second EX
  would be rejected by Redis or expire instantly, defeating the lock.

NOT worth testing:
- The Redis SET NX EX semantics themselves — Redis is the contract.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.infrastructure.jobs.redis_leader_lock import acquire_or_skip


@pytest.mark.asyncio
async def test_returns_true_when_redis_acquires() -> None:
    redis = AsyncMock()
    redis.set.return_value = True

    got = await acquire_or_skip(redis, "job:x", ttl_seconds=2.5)

    assert got is True
    redis.set.assert_awaited_once_with("job:x", "1", nx=True, px=2500)


@pytest.mark.asyncio
async def test_returns_false_when_redis_already_held() -> None:
    redis = AsyncMock()
    redis.set.return_value = None  # SET NX returns nil on key-exists

    got = await acquire_or_skip(redis, "job:x", ttl_seconds=5)

    assert got is False


@pytest.mark.asyncio
async def test_ttl_floor_prevents_degenerate_zero() -> None:
    """A 0s requested TTL is floored to 100ms — without the floor a
    misconfigured caller could effectively disable the gate."""
    redis = AsyncMock()
    redis.set.return_value = True

    await acquire_or_skip(redis, "job:x", ttl_seconds=0)

    args, kwargs = redis.set.await_args
    assert kwargs["px"] >= 100


@pytest.mark.asyncio
async def test_subsecond_ttl_uses_px_not_ex() -> None:
    """A 0.9s TTL (typical for 1s interval jobs) must NOT collapse to an
    integer second — would race the next tick and break the gate."""
    redis = AsyncMock()
    redis.set.return_value = True

    await acquire_or_skip(redis, "job:x", ttl_seconds=0.9)

    args, kwargs = redis.set.await_args
    assert kwargs["px"] == 900
    assert "ex" not in kwargs
