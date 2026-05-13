from __future__ import annotations

from typing import Protocol

from redis.asyncio import Redis


class IRateLimiter(Protocol):
    async def check(self, *, key: str, limit: int, window_seconds: int) -> bool:
        """Returns True if the action is allowed, False if rate-limited."""
        ...


class RedisRateLimiter(IRateLimiter):
    def __init__(self, redis: Redis) -> None:
        self._r = redis

    async def check(self, *, key: str, limit: int, window_seconds: int) -> bool:
        full_key = f"rl:{key}"
        async with self._r.pipeline() as pipe:
            pipe.incr(full_key)
            pipe.expire(full_key, window_seconds, nx=True)
            count, _ = await pipe.execute()
        return int(count) <= limit
