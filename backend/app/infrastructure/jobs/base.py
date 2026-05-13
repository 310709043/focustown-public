from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol


class IJobScheduler(Protocol):
    def schedule_interval(
        self, *, job_id: str, func: Callable[[], Awaitable[None]], seconds: int
    ) -> None: ...

    def schedule_cron(
        self,
        *,
        job_id: str,
        func: Callable[[], Awaitable[None]],
        hour: int,
        minute: int,
    ) -> None: ...

    async def start(self) -> None: ...
    async def shutdown(self) -> None: ...
