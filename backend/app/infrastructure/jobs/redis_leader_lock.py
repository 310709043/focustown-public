"""Redis-backed single-leader gate for scheduled jobs.

When the worker process is replicated (N>1 containers), each replica's
APScheduler fires every tick independently. ``acquire_or_skip`` lets one
replica do the work for a given tick while the others see ``False`` and
return immediately.

The lock is intentionally NOT released — its TTL is the only release
mechanism. Releasing on completion would let a second replica pick the
key up on the same tick and double-fire if the first finished early; the
small cost of waiting for the TTL is worth the strict "at most once per
tick" guarantee. A run slower than its TTL simply forfeits the next
tick (operator-visible via the skipped counter), which is preferable
to double-running.
"""

from __future__ import annotations

from redis.asyncio import Redis


async def acquire_or_skip(
    redis_client: Redis, key: str, ttl_seconds: float
) -> bool:
    """Try ``SET key 1 NX PX <ttl_ms>``. Return True iff this caller won the tick.

    Uses ``PX`` (millisecond TTL) so sub-second TTLs work as intended —
    a 1-second job interval wants ~900ms TTL, which integer-second
    ``EX`` would round up to 1s and break the next-tick acquire on a
    fast machine. Floor at 100ms so a degenerate call (e.g. ttl=0)
    can't disable the gate entirely.
    """
    ttl_ms = max(100, int(ttl_seconds * 1000))
    result = await redis_client.set(key, "1", nx=True, px=ttl_ms)
    return bool(result)
