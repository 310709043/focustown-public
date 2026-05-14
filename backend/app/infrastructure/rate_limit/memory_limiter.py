from __future__ import annotations

import time
from dataclasses import dataclass

from app.domain.rate_limit import IRateLimiter, RateLimitDecision


@dataclass
class _Bucket:
    count: int
    reset_at: float


class MemoryRateLimiter(IRateLimiter):
    """Process-local fixed-window limiter for tests / single-worker dev.

    Not suitable for multi-process deployment — use RedisRateLimiter there.
    """

    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}

    async def hit(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        now = time.monotonic()
        bucket = self._buckets.get(key)
        if bucket is None or bucket.reset_at <= now:
            bucket = _Bucket(count=1, reset_at=now + window_seconds)
            self._buckets[key] = bucket
            return RateLimitDecision(
                allowed=True, remaining=limit - 1, retry_after_seconds=0
            )

        bucket.count += 1
        if bucket.count > limit:
            return RateLimitDecision(
                allowed=False,
                remaining=0,
                retry_after_seconds=max(1, int(bucket.reset_at - now)),
            )
        return RateLimitDecision(
            allowed=True,
            remaining=max(0, limit - bucket.count),
            retry_after_seconds=0,
        )

    def reset(self) -> None:
        self._buckets.clear()
