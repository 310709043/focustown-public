from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class RateLimitDecision:
    allowed: bool
    remaining: int
    retry_after_seconds: int  # 0 when allowed


class IRateLimiter(Protocol):
    """Fixed-window counter with TTL-based reset.

    Implementations:
      - RedisRateLimiter: INCR + EXPIRE for multi-process correctness
      - MemoryRateLimiter: process-local dict for tests / single-worker dev
    """

    async def hit(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision: ...
