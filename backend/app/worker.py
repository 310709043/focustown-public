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
from app.core.exceptions import BusinessError
from app.core.ids import UUID4Generator
from app.core.logging import configure_logging, get_logger
from app.domain.services.focus_session_service import FocusSessionService
from app.domain.services.leaderboard_service import LeaderboardService
from app.domain.services.matching_queue_service import MatchingQueueService
from app.domain.services.matching_service import MatchingService
from app.domain.services.station_service import StationService
from app.domain.services.strategies import SimpleOverlapStrategy
from app.infrastructure.cache.redis_client import close_redis, get_redis, init_redis
from app.infrastructure.cache.station_cache import RedisStationCache
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlLeaderboardSnapshotRepo,
    SqlMatchRepo,
    SqlUserRepo,
)
from app.infrastructure.db.repositories.station_repo import SqlStationSnapshotRepo
from app.infrastructure.db.repositories.track_repo import SqlTrackRepo
from app.infrastructure.db.session import (
    dispose_engine,
    get_session_factory,
)
from app.infrastructure.jobs.apscheduler_adapter import APSchedulerAdapter
from app.infrastructure.matching.redis_queue import RedisMatchingQueue
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher
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


def _build_station_service(db) -> StationService:
    """Shared wiring for the three station worker jobs.

    Constructs a publisher in publish-only mode (no listen loop) — the WS
    subscribe loop lives inside the API process. The cache + repo share
    the worker's already-initialised Redis singleton and a per-job DB
    session.
    """
    redis = get_redis()
    return StationService(
        cache=RedisStationCache(redis),
        snapshots_reader=SqlStationSnapshotRepo(db, UUID4Generator()),
        snapshots_writer=SqlStationSnapshotRepo(db, UUID4Generator()),
        tracks=SqlTrackRepo(db),
        realtime=RedisPubSubPublisher(redis),
        clock=SystemClock(),
    )


def _scope_id_from_pair_key(key: str) -> str | None:
    # ``station:pair:{match_id}`` — return None if the key doesn't fit
    # so a foreign key in the same DB doesn't crash the loop.
    prefix = "station:pair:"
    return key[len(prefix):] if key.startswith(prefix) else None


async def advance_city_station(factory) -> None:
    """Worker tick — advance the single global city station if due.

    5s interval gives ≤5s of post-track silence as an absolute ceiling,
    inaudible vs. ~180s average track. One Redis PUBLISH per advance
    reaches every backend process; each fans out to local WS sockets via
    the existing WSManager bridge. Cheaper than per-track ``run_date``
    jobs, which would explode at thousands of pairs.
    """
    settings = get_settings()
    if not settings.feat_shared_station:
        return
    async with factory() as db:
        svc = _build_station_service(db)
        try:
            now_ms = int(SystemClock().now().timestamp() * 1000)
            await svc.advance_if_due(
                kind="city",
                scope_id=settings.default_city_id,
                now_ms=now_ms,
            )
        except BusinessError as e:
            # ``no_tracks_available`` — seeded catalog is empty. Don't crash
            # the worker; ops will see the log line and seed the catalog.
            log.warning("station_advance_skipped", reason=str(e))
        await db.commit()


async def advance_pair_stations(factory) -> None:
    """Worker tick — advance every live pair station whose track ended.

    SCAN (not KEYS) so a thousand simultaneous matches don't block the
    Redis event loop. Per-tick cost = one SCAN cursor walk + N GETs (one
    per active pair). Pair keys carry a sliding 6h TTL refreshed inside
    ``RedisStationCache.set`` on every advance.
    """
    settings = get_settings()
    if not settings.feat_shared_station:
        return
    async with factory() as db:
        svc = _build_station_service(db)
        now_ms = int(SystemClock().now().timestamp() * 1000)
        async for key in svc.cache.scan_pair_keys():
            scope_id = _scope_id_from_pair_key(key)
            if scope_id is None:
                continue
            try:
                await svc.advance_if_due(
                    kind="pair", scope_id=scope_id, now_ms=now_ms
                )
            except Exception:
                log.exception("station_pair_advance_failed", scope_id=scope_id)
        await db.commit()


async def snapshot_stations_to_db(factory) -> None:
    """Worker tick — persist every live station cursor to Postgres.

    Crash-recovery only: the Redis cache is the source of truth for the
    live timeline. A Redis restart re-seeds from the most recent snapshot
    (lagging by up to one snapshot interval) instead of mid-song
    teleporting every connected listener to a fresh shuffle.
    """
    settings = get_settings()
    if not settings.feat_shared_station:
        return
    async with factory() as db:
        svc = _build_station_service(db)
        await svc.snapshot_to_db(
            kind="city", scope_id=settings.default_city_id
        )
        async for key in svc.cache.scan_pair_keys():
            scope_id = _scope_id_from_pair_key(key)
            if scope_id is None:
                continue
            await svc.snapshot_to_db(kind="pair", scope_id=scope_id)
        await db.commit()


async def sweep_matching_queue_job(factory) -> None:
    """Worker tick — pair waiting users and bot-fallback the overdue.

    3s cadence keeps end-to-end "click match → see partner" under 5s in
    the worst case (immediate-pair on enqueue covers the sub-second
    common case; this is the safety net for simultaneous enqueues and
    the only place that fires bot-fallback for users past their per-user
    deadline). Each iteration touches Redis only — DB is hit when a pair
    actually forms via ``MatchingService.propose``.

    The worker uses its own ``EventBus``; ``MatchRealtimeLink`` lives in
    the API process so ``MatchProposed`` events raised here have no
    in-process subscribers. ``MatchingQueueService`` explicitly publishes
    ``match.proposed`` to each side via the cross-process
    ``IRealtimePublisher`` so connected clients still see the frame
    regardless of which process formed the pair.
    """
    async with factory() as db:
        redis = get_redis()
        clock = SystemClock()
        events = EventBus()
        matching = MatchingService(
            users=SqlUserRepo(db),
            matches=SqlMatchRepo(db),
            sessions=SqlFocusSessionRepo(db),
            strategy=SimpleOverlapStrategy(),
            events=events,
            ids=UUID4Generator(),
            clock=clock,
        )
        svc = MatchingQueueService(
            queue=RedisMatchingQueue(redis),
            matching=matching,
            matches_reader=SqlMatchRepo(db),
            users=SqlUserRepo(db),
            publisher=RedisPubSubPublisher(redis),
            clock=clock,
        )
        await svc.sweep()
        await db.commit()


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
    await init_redis(settings.redis_url, settings.redis_auth_token)
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
    scheduler.schedule_interval(
        job_id="sweep_matching_queue",
        func=_log_job_errors(
            "sweep_matching_queue",
            partial(sweep_matching_queue_job, factory),
        ),
        seconds=3,
    )
    scheduler.schedule_cron(
        job_id="snapshot_leaderboard",
        func=_log_job_errors(
            "snapshot_leaderboard", partial(snapshot_leaderboard, factory)
        ),
        hour=1,
        minute=0,
    )
    # Shared cohort music stations (Phase 10). Self-gated by
    # settings.feat_shared_station so the jobs no-op without breaking
    # the scheduler when the feature is off.
    scheduler.schedule_interval(
        job_id="advance_city_station",
        func=_log_job_errors(
            "advance_city_station", partial(advance_city_station, factory)
        ),
        seconds=settings.station_advance_interval_seconds,
    )
    scheduler.schedule_interval(
        job_id="advance_pair_stations",
        func=_log_job_errors(
            "advance_pair_stations", partial(advance_pair_stations, factory)
        ),
        seconds=settings.station_advance_interval_seconds,
    )
    scheduler.schedule_interval(
        job_id="snapshot_stations_to_db",
        func=_log_job_errors(
            "snapshot_stations_to_db", partial(snapshot_stations_to_db, factory)
        ),
        seconds=settings.station_snapshot_interval_seconds,
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
