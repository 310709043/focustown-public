from __future__ import annotations

from redis.asyncio import Redis

from app.domain.rate_limit import IRateLimiter, RateLimitDecision


class RedisRateLimiter(IRateLimiter):
    """Fixed-window counter in Redis: INCR + EXPIRE.

    Correct across multiple backend processes. The first hit in a window
    sets the TTL; subsequent hits inside the same window read the remaining
    TTL via PTTL to compute retry_after on rejection.
    """

    def __init__(self, redis: Redis, *, key_prefix: str = "ratelimit") -> None:
        self._redis = redis
        self._prefix = key_prefix

    def _build_key(self, key: str) -> str:
        return f"{self._prefix}:{key}"

    async def hit(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        redis_key = self._build_key(key)
        count = await self._redis.incr(redis_key)
        if count == 1:
            await self._redis.expire(redis_key, window_seconds)

        if count > limit:
            ttl_ms = await self._redis.pttl(redis_key)
            retry = max(1, (ttl_ms + 999) // 1000) if ttl_ms > 0 else window_seconds
            return RateLimitDecision(allowed=False, remaining=0, retry_after_seconds=retry)

        return RateLimitDecision(
            allowed=True,
            remaining=max(0, limit - count),
            retry_after_seconds=0,
        )
