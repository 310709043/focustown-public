"""Background worker process.

Runs APScheduler with the abandoned-session sweeper and (TODO) daily
leaderboard snapshot. Started as its own container in docker-compose so
restarting the API doesn't drop in-flight jobs.

v2 path on AWS: replace APSchedulerAdapter with EventBridgeAdapter so the
schedule lives in CloudWatch Events / EventBridge Scheduler and the work
runs in Fargate scheduled tasks or Lambda.
"""

from __future__ import annotations

import asyncio

from app.core.clock import SystemClock
from app.core.config import get_settings
from app.core.events import EventBus
from app.core.ids import UUID4Generator
from app.core.logging import configure_logging, get_logger
from app.domain.services.focus_session_service import FocusSessionService
from app.infrastructure.cache.redis_client import close_redis, init_redis
from app.infrastructure.db.repositories import SqlFocusSessionRepo
from app.infrastructure.db.session import dispose_engine, get_session_factory
from app.infrastructure.jobs.apscheduler_adapter import APSchedulerAdapter

log = get_logger(__name__)


async def main() -> None:
    settings = get_settings()
    configure_logging(debug=settings.app_debug)
    log.info("worker_starting")
    await init_redis(settings.redis_url)
    factory = get_session_factory(settings.database_url)
    bus = EventBus()
    scheduler = APSchedulerAdapter()

    async def sweep_abandoned() -> None:
        async with factory() as db:
            svc = FocusSessionService(
                repo=SqlFocusSessionRepo(db),
                clock=SystemClock(),
                ids=UUID4Generator(),
                events=bus,
            )
            abandoned = await svc.sweep_abandoned()
            await db.commit()
            if abandoned:
                log.info("sweep_abandoned", count=len(abandoned))

    scheduler.schedule_interval(job_id="sweep_abandoned", func=sweep_abandoned, seconds=60)
    await scheduler.start()
    log.info("worker_ready")

    try:
        # Park forever; APScheduler runs in the same loop.
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        log.info("worker_stopping")
    finally:
        await scheduler.shutdown()
        await close_redis()
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
