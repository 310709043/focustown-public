from __future__ import annotations

import asyncio

from app.infrastructure.rate_limit.memory_limiter import MemoryRateLimiter


async def test_allows_up_to_limit():
    limiter = MemoryRateLimiter()
    for _ in range(5):
        decision = await limiter.hit("k", limit=5, window_seconds=60)
        assert decision.allowed


async def test_rejects_beyond_limit():
    limiter = MemoryRateLimiter()
    for _ in range(3):
        await limiter.hit("k", limit=3, window_seconds=60)
    decision = await limiter.hit("k", limit=3, window_seconds=60)
    assert not decision.allowed
    assert decision.retry_after_seconds > 0


async def test_keys_are_independent():
    limiter = MemoryRateLimiter()
    for _ in range(3):
        await limiter.hit("a", limit=3, window_seconds=60)
    decision = await limiter.hit("b", limit=3, window_seconds=60)
    assert decision.allowed


async def test_window_resets_after_expiry():
    limiter = MemoryRateLimiter()
    for _ in range(2):
        await limiter.hit("k", limit=2, window_seconds=1)
    await asyncio.sleep(1.1)
    decision = await limiter.hit("k", limit=2, window_seconds=1)
    assert decision.allowed
