from __future__ import annotations

from app.core.logging import get_logger
from app.core.metrics import match_queue_redis_drift_total
from app.domain.repositories.match_queue import IMatchingQueue
from app.domain.repositories.match_waiting_pool_repo import IMatchWaitingPoolRepo

log = get_logger(__name__)


async def reconcile_redis_from_pg(
    *, queue: IMatchingQueue, pool: IMatchWaitingPoolRepo
) -> None:
    """Diff Redis ZSET against PG ``waiting`` rows and repair drift.

    Direction 1 — ``pg_to_redis``
        Any row in ``waiting`` that has no Redis member is re-enqueued.
        This is the recovery path after a Redis crash / FLUSHALL.

    Direction 2 — ``redis_to_pg``
        Any Redis ZSET member that has no live ``waiting`` row in PG is
        evicted from Redis. Covers the case where a dual-write path
        flipped the row to ``cancelled`` / ``paired`` / ``bot_fallback``
        but the Redis side failed mid-flight — left behind, the ghost
        member would be paired by the sweep.

    PG is source of truth in both directions; the reconciler never
    re-creates a PG row from Redis state.
    """
    pg_records = {r.user_id: r for r in await pool.list_waiting()}
    redis_entries = await queue.list_waiters()
    redis_user_ids = {e.user_id for e in redis_entries}

    missing_in_redis = [
        record
        for user_id, record in pg_records.items()
        if user_id not in redis_user_ids
    ]
    for record in missing_in_redis:
        added = await queue.enqueue(
            record.user_id,
            enqueued_at_ms=record.enqueued_at_ms,
            fallback_deadline_ms=record.fallback_deadline_ms,
        )
        if added:
            match_queue_redis_drift_total.labels(
                direction="pg_to_redis"
            ).inc()

    stale_in_redis = [
        entry.user_id
        for entry in redis_entries
        if entry.user_id not in pg_records
    ]
    for user_id in stale_in_redis:
        removed = await queue.cancel(user_id)
        if removed:
            match_queue_redis_drift_total.labels(
                direction="redis_to_pg"
            ).inc()


async def warm_redis_on_boot(
    *, queue: IMatchingQueue, pool: IMatchWaitingPoolRepo
) -> None:
    """One-shot boot warm-up — replay every ``waiting`` PG row into Redis.

    Called from ``worker.main()`` BEFORE the scheduler starts ticking so
    the sweep job never sees an empty queue while PG still records
    in-flight waiters. Logged at INFO with the row count so ops can see
    "restored N waiters" in worker startup logs after a Redis crash.

    Increments ``match_queue_redis_drift_total{direction="pg_to_redis"}``
    for every row re-warmed — symmetrical with the periodic
    reconciliation tick.
    """
    pg_records = await pool.list_waiting()
    if not pg_records:
        log.info("matching_queue_boot_warm_empty")
        return
    restored = 0
    for record in pg_records:
        added = await queue.enqueue(
            record.user_id,
            enqueued_at_ms=record.enqueued_at_ms,
            fallback_deadline_ms=record.fallback_deadline_ms,
        )
        if added:
            match_queue_redis_drift_total.labels(
                direction="pg_to_redis"
            ).inc()
            restored += 1
    log.info(
        "matching_queue_boot_warm_restored",
        restored=restored,
        total=len(pg_records),
    )
