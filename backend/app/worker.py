"""Background worker process.

Runs APScheduler with the abandoned-session sweeper and a daily
leaderboard snapshot job. Started as its own container in
docker-compose so restarting the API doesn't drop in-flight jobs.

The job coroutines (``sweep_abandoned``, ``snapshot_leaderboard``) are
defined at module scope so they can be invoked directly from a smoke
test or REPL without needing the scheduler to fire.

v2 path on AWS: replace APSchedulerAdapter with EventBridgeAdapter so the
schedule lives in CloudWatch Events / EventBridge Scheduler and the work
runs in Fargate scheduled tasks or Lambda.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from functools import partial

import structlog

from app.core.clock import SystemClock
from app.core.config import get_settings
from app.core.events import EventBus
from app.core.ids import UUID4Generator
from app.core.logging import configure_logging, get_logger
from app.domain.services.focus_session_service import FocusSessionService
from app.domain.services.leaderboard_service import LeaderboardService
from app.infrastructure.cache.redis_client import close_redis, get_redis, init_redis
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlLeaderboardSnapshotRepo,
    SqlUserRepo,
)
from app.infrastructure.db.session import (
    dispose_engine,
    get_session_factory,
)
from app.infrastructure.jobs.apscheduler_adapter import APSchedulerAdapter
from app.infrastructure.presence.bot_seeder import refresh_bot_presence
from app.infrastructure.presence.redis_tracker import RedisPresenceTracker

log = get_logger(__name__)


def _log_job_errors(
    job_id: str, coro_factory: Callable[[], Awaitable[None]]
) -> Callable[[], Awaitable[None]]:
    """Wrap a scheduled coroutine so any exception is logged with full
    traceback before it surfaces back into APScheduler.

    APScheduler's default error handling logs through the stdlib logger,
    which (a) bypasses our structlog JSON renderer and (b) drops the job
    context that operators need for triage. This wrapper guarantees a
    `worker_job_failed` line with `job=...` and a traceback, then re-raises
    so the scheduler still records the misfire.
    """

    async def wrapped() -> None:
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(job=job_id)
        try:
            await coro_factory()
        except Exception:
            log.exception("worker_job_failed", job=job_id)
            raise
        finally:
            structlog.contextvars.clear_contextvars()

    return wrapped


async def sweep_abandoned(factory, bus: EventBus) -> None:
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


async def snapshot_leaderboard(factory) -> None:
    async with factory() as db:
        svc = LeaderboardService(
            sessions=SqlFocusSessionRepo(db),
            users=SqlUserRepo(db),
            clock=SystemClock(),
        )
        snapshots = SqlLeaderboardSnapshotRepo(db)
        written = await svc.write_snapshot_for_yesterday(snapshots=snapshots)
        await db.commit()
        log.info("snapshot_leaderboard", rows=written)


async def refresh_bot_presence_job(factory) -> None:
    """Worker tick — keep bot Redis presence alive (90s TTL).

    Runs every 60s so each bot's HASH never expires. Read-only on the
    DB side (only ``SqlUserRepo.list_bots()`` is called); the write goes
    to Redis through ``IPresenceTracker.online``.
    """
    async with factory() as db:
        await refresh_bot_presence(
            reader=SqlUserRepo(db),
            tracker=RedisPresenceTracker(get_redis(), SystemClock()),
        )


async def main() -> None:
    settings = get_settings()
    configure_logging(debug=settings.app_debug)
    log.info("worker_starting")
    await init_redis(settings.redis_url)
    factory = get_session_factory(settings.database_url)
    bus = EventBus()
    scheduler = APSchedulerAdapter()

    scheduler.schedule_interval(
        job_id="sweep_abandoned",
        func=_log_job_errors(
            "sweep_abandoned", partial(sweep_abandoned, factory, bus)
        ),
        seconds=60,
    )
    scheduler.schedule_interval(
        job_id="refresh_bot_presence",
        func=_log_job_errors(
            "refresh_bot_presence", partial(refresh_bot_presence_job, factory)
        ),
        seconds=60,
    )
    scheduler.schedule_cron(
        job_id="snapshot_leaderboard",
        func=_log_job_errors(
            "snapshot_leaderboard", partial(snapshot_leaderboard, factory)
        ),
        hour=1,
        minute=0,
    )
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
