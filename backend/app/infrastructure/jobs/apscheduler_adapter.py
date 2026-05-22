from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from redis.asyncio import Redis

from app.core.logging import get_logger
from app.core.metrics import (
    scheduler_lock_acquired_total,
    scheduler_lock_skipped_total,
)
from app.infrastructure.jobs.base import IJobScheduler
from app.infrastructure.jobs.redis_leader_lock import acquire_or_skip

log = get_logger(__name__)

# Cron jobs run far apart (worst case here: daily). A long lock TTL is
# safe: only one replica needs to hold the gate for the duration of the
# job, and we don't want a fast finisher releasing the gate early and
# letting a peer re-fire on the same minute.
_CRON_LOCK_TTL_SECONDS = 300


def _interval_lock_ttl(seconds: int) -> float:
    """interval * 0.9 (per spec): a slow run forfeits the *next* tick, but
    a missed unlock can't gap the tick after that."""
    return max(1.0, seconds * 0.9)


class APSchedulerAdapter(IJobScheduler):
    """In-process scheduler with Redis-backed single-leader election.

    Every callback is wrapped so that at each tick exactly one replica
    runs the body and the rest log + increment the skipped counter and
    return. The lock key is ``job:{job_id}``.
    """

    def __init__(self, redis: Redis | None = None) -> None:
        self._sched = AsyncIOScheduler()
        self._redis = redis

    def _wrap_with_lock(
        self,
        *,
        job_id: str,
        func: Callable[[], Awaitable[None]],
        ttl_seconds: float,
    ) -> Callable[[], Awaitable[None]]:
        redis = self._redis
        if redis is None:
            # No Redis injected → single-process fallback. Useful for
            # tests that don't spin up Redis. Production wiring always
            # passes the shared client.
            return func

        async def gated() -> None:
            key = f"job:{job_id}"
            got = await acquire_or_skip(redis, key, ttl_seconds)
            if not got:
                scheduler_lock_skipped_total.labels(job=job_id).inc()
                log.debug("scheduler_lock_skipped", job=job_id)
                return
            scheduler_lock_acquired_total.labels(job=job_id).inc()
            await func()

        return gated

    def schedule_interval(
        self, *, job_id: str, func: Callable[[], Awaitable[None]], seconds: int
    ) -> None:
        wrapped = self._wrap_with_lock(
            job_id=job_id, func=func, ttl_seconds=_interval_lock_ttl(seconds)
        )
        self._sched.add_job(
            wrapped,
            trigger=IntervalTrigger(seconds=seconds),
            id=job_id,
            replace_existing=True,
        )

    def schedule_cron(
        self,
        *,
        job_id: str,
        func: Callable[[], Awaitable[None]],
        hour: int,
        minute: int,
    ) -> None:
        wrapped = self._wrap_with_lock(
            job_id=job_id, func=func, ttl_seconds=_CRON_LOCK_TTL_SECONDS
        )
        self._sched.add_job(
            wrapped,
            trigger=CronTrigger(hour=hour, minute=minute),
            id=job_id,
            replace_existing=True,
        )

    async def start(self) -> None:
        self._sched.start()

    async def shutdown(self) -> None:
        self._sched.shutdown(wait=False)
        await asyncio.sleep(0)
