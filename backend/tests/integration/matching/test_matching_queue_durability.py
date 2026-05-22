"""Phase 06 acceptance: a Redis FLUSHALL mid-wait does NOT lose the queue.

PG is source of truth; the reconciliation tick replays every ``waiting``
row back into Redis. This test simulates the Lightsail-without-RDB
restart scenario by directly flushing the Redis DB between enqueues and
the reconciliation, then asserts every PG ``waiting`` row is present in
both the Redis ZSET and the per-user HASH after one reconcile pass.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.metrics import match_queue_redis_drift_total, reset_all_for_tests
from app.domain.services.matching_queue_reconciler import reconcile_redis_from_pg
from app.infrastructure.db.repositories.match_waiting_pool_repo import (
    SqlMatchWaitingPoolRepo,
)
from app.infrastructure.matching.redis_queue import RedisMatchingQueue


async def _insert_user(db_session, *, user_id: str, email: str) -> None:
    now = datetime.now(UTC).replace(tzinfo=None) + timedelta(
        seconds=hash(user_id) % 1000
    )
    await db_session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, "
            "is_active, is_bot, created_at, updated_at) VALUES "
            "(:id, :email, 'x', 'Test', true, false, :now, :now)"
        ),
        {"id": user_id, "email": email, "now": now},
    )


@pytest.fixture(autouse=True)
def _reset_metrics():
    reset_all_for_tests()
    yield
    reset_all_for_tests()


@pytest.mark.asyncio
async def test_redis_flush_mid_wait_recovered_by_reconciler(
    db_session, flushed_redis
) -> None:
    queue = RedisMatchingQueue(flushed_redis)
    pool = SqlMatchWaitingPoolRepo(db_session)
    for idx, user_id in enumerate(["u-1", "u-2", "u-3"]):
        await _insert_user(db_session, user_id=user_id, email=f"{user_id}@x")
        # Dual-write the way MatchingQueueService.request() would.
        await pool.upsert_waiting(
            user_id,
            enqueued_at_ms=1_000 + idx,
            fallback_deadline_ms=2_000 + idx,
        )
        await queue.enqueue(
            user_id,
            enqueued_at_ms=1_000 + idx,
            fallback_deadline_ms=2_000 + idx,
        )
    # Commit so a fresh client/snapshot would see the rows (the reconciler
    # uses the same session, but the commit also flushes pending UPDATEs
    # that would otherwise sit in the SAVEPOINT).
    await db_session.commit()

    pre_waiters = await queue.list_waiters()
    assert {w.user_id for w in pre_waiters} == {"u-1", "u-2", "u-3"}

    # The chaos event — Lightsail Redis restart without persistence.
    await flushed_redis.flushdb()
    assert await queue.list_waiters() == []

    await reconcile_redis_from_pg(queue=queue, pool=pool)

    post_waiters = await queue.list_waiters()
    assert {w.user_id for w in post_waiters} == {"u-1", "u-2", "u-3"}
    # ZSET scores preserved — bot-fallback deadlines depend on a stable
    # enqueue time, not the reconciliation timestamp.
    by_id = {w.user_id: w for w in post_waiters}
    assert by_id["u-1"].enqueued_at_ms == 1_000
    assert by_id["u-2"].enqueued_at_ms == 1_001
    assert by_id["u-3"].enqueued_at_ms == 1_002
    # Per-user HASH (carries the fallback deadline) restored too.
    assert by_id["u-1"].fallback_deadline_ms == 2_000

    assert (
        match_queue_redis_drift_total.value(direction="pg_to_redis") == 3
    )
    assert (
        match_queue_redis_drift_total.value(direction="redis_to_pg") == 0
    )


@pytest.mark.asyncio
async def test_reconciler_prunes_ghost_redis_member(
    db_session, flushed_redis
) -> None:
    """Inverse drift: a Redis member with no live ``waiting`` PG row gets
    evicted from Redis. Covers the case where a dual-write path flipped
    the PG row to ``cancelled`` but the Redis side failed mid-flight."""
    queue = RedisMatchingQueue(flushed_redis)
    pool = SqlMatchWaitingPoolRepo(db_session)
    await _insert_user(db_session, user_id="u-ghost", email="g@x")
    # Ghost: in Redis but not in PG.
    await queue.enqueue(
        "u-ghost", enqueued_at_ms=42, fallback_deadline_ms=100
    )
    await db_session.commit()

    await reconcile_redis_from_pg(queue=queue, pool=pool)

    assert await queue.list_waiters() == []
    assert (
        match_queue_redis_drift_total.value(direction="redis_to_pg") == 1
    )
    assert (
        match_queue_redis_drift_total.value(direction="pg_to_redis") == 0
    )


@pytest.mark.asyncio
async def test_reconciler_does_not_replay_terminal_states(
    db_session, flushed_redis
) -> None:
    """``paired`` / ``cancelled`` / ``bot_fallback`` are terminal — the
    reconciler must NOT re-enqueue them after a Redis flush, otherwise a
    Redis restart re-queues users who already got matched."""
    queue = RedisMatchingQueue(flushed_redis)
    pool = SqlMatchWaitingPoolRepo(db_session)
    for user_id, terminal_op in (
        ("u-paired", lambda: pool.mark_paired("u-paired", match_id="m")),
        ("u-cancelled", lambda: pool.mark_cancelled("u-cancelled")),
        ("u-bot", lambda: pool.mark_bot_fallback("u-bot")),
    ):
        await _insert_user(db_session, user_id=user_id, email=f"{user_id}@x")
        await pool.upsert_waiting(
            user_id, enqueued_at_ms=1, fallback_deadline_ms=2
        )
        await terminal_op()
    await db_session.commit()
    # Redis is empty — simulates a flush before any reconcile ran.
    assert await queue.list_waiters() == []

    await reconcile_redis_from_pg(queue=queue, pool=pool)

    assert await queue.list_waiters() == []
    assert (
        match_queue_redis_drift_total.value(direction="pg_to_redis") == 0
    )
