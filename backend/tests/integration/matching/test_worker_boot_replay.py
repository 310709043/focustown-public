"""Worker boot warm-up — replay PG ``waiting`` rows into Redis before
the sweep starts ticking.

Without this, a worker restart after a Redis crash would run for up to
30s on an empty queue (sweep ticks at 3s, reconcile at 30s) and pair
nobody while PG still records the in-flight waiters.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.core.metrics import match_queue_redis_drift_total, reset_all_for_tests
from app.domain.services.matching_queue_reconciler import warm_redis_on_boot
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
async def test_warm_redis_on_boot_replays_waiting_rows(
    db_session, flushed_redis
) -> None:
    queue = RedisMatchingQueue(flushed_redis)
    pool = SqlMatchWaitingPoolRepo(db_session)
    await _insert_user(db_session, user_id="u-w1", email="w1@x")
    await _insert_user(db_session, user_id="u-w2", email="w2@x")
    await pool.upsert_waiting(
        "u-w1", enqueued_at_ms=1_000, fallback_deadline_ms=10_000
    )
    await pool.upsert_waiting(
        "u-w2", enqueued_at_ms=1_500, fallback_deadline_ms=10_500
    )
    await db_session.commit()
    # Redis starts empty — the scenario worker boot is designed for.
    assert await queue.list_waiters() == []

    await warm_redis_on_boot(queue=queue, pool=pool)

    waiters = await queue.list_waiters()
    by_id = {w.user_id: w for w in waiters}
    assert set(by_id) == {"u-w1", "u-w2"}
    # ZSET score = enqueued_at_ms is preserved so the FIFO order survives
    # the restart (otherwise pairing would prefer late arrivals over the
    # users who were waiting before the crash).
    assert by_id["u-w1"].enqueued_at_ms == 1_000
    assert by_id["u-w2"].enqueued_at_ms == 1_500
    # Per-user HASH (fallback deadline) must also round-trip.
    assert by_id["u-w1"].fallback_deadline_ms == 10_000
    assert by_id["u-w2"].fallback_deadline_ms == 10_500

    assert (
        match_queue_redis_drift_total.value(direction="pg_to_redis") == 2
    )


@pytest.mark.asyncio
async def test_warm_redis_on_boot_no_op_when_pg_empty(
    db_session, flushed_redis
) -> None:
    queue = RedisMatchingQueue(flushed_redis)
    pool = SqlMatchWaitingPoolRepo(db_session)

    await warm_redis_on_boot(queue=queue, pool=pool)

    assert await queue.list_waiters() == []
    assert (
        match_queue_redis_drift_total.value(direction="pg_to_redis") == 0
    )


@pytest.mark.asyncio
async def test_warm_redis_on_boot_skips_terminal_states(
    db_session, flushed_redis
) -> None:
    queue = RedisMatchingQueue(flushed_redis)
    pool = SqlMatchWaitingPoolRepo(db_session)
    await _insert_user(db_session, user_id="u-paired", email="p@x")
    await _insert_user(db_session, user_id="u-cancelled", email="c@x")
    await _insert_user(db_session, user_id="u-waiting", email="w@x")
    await pool.upsert_waiting(
        "u-paired", enqueued_at_ms=1, fallback_deadline_ms=2
    )
    await pool.mark_paired("u-paired", match_id="m")
    await pool.upsert_waiting(
        "u-cancelled", enqueued_at_ms=3, fallback_deadline_ms=4
    )
    await pool.mark_cancelled("u-cancelled")
    await pool.upsert_waiting(
        "u-waiting", enqueued_at_ms=5, fallback_deadline_ms=6
    )
    await db_session.commit()

    await warm_redis_on_boot(queue=queue, pool=pool)

    waiters = await queue.list_waiters()
    assert {w.user_id for w in waiters} == {"u-waiting"}
