from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.infrastructure.jobs.base import IJobScheduler


class APSchedulerAdapter(IJobScheduler):
    def __init__(self) -> None:
        self._sched = AsyncIOScheduler()

    def schedule_interval(
        self, *, job_id: str, func: Callable[[], Awaitable[None]], seconds: int
    ) -> None:
        self._sched.add_job(
            func,
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
        self._sched.add_job(
            func,
            trigger=CronTrigger(hour=hour, minute=minute),
            id=job_id,
            replace_existing=True,
        )

    async def start(self) -> None:
        self._sched.start()

    async def shutdown(self) -> None:
        self._sched.shutdown(wait=False)
        await asyncio.sleep(0)
