"""Integration test for the multi-process scheduler leader lock.

Spec: two independent ``APSchedulerAdapter`` instances against the same
Redis ⇒ for any given tick, exactly one body call lands.

Why integration (not unit): the leader lock is a Redis ``SET NX`` race.
A mocked client can't model the atomic-or-skip semantic we depend on —
this test catches a regression that downgrades the lock to a
read-then-write pair.

What's verified:

- ``acquired == bodies_run`` — the wrapper only increments the
  acquire counter when the body is about to fire, so this is an
  invariant by construction; the test guards against a refactor that
  decouples them.
- ``skipped > 0`` with two schedulers — proves the second replica
  observed the lock as held and short-circuited.
- ``bodies_run`` is bounded by ``floor(window / interval) + 1`` —
  proves the gate is NOT firing every scheduler's body each tick
  (which would land 2x the expected count for two replicas).

What is intentionally NOT verified: the exact body count, because
APScheduler firing alignment between two independent scheduler
instances is non-deterministic — testing it would flake on busy CI.
"""
from __future__ import annotations

import asyncio
from collections import Counter as CCounter

import pytest

from app.core import metrics
from app.infrastructure.jobs.apscheduler_adapter import APSchedulerAdapter

# 1-second interval over a ~5s window: between 3 and 5 ticks plausible.
# Single-replica ceiling is the upper bound — two replicas safely gated
# must stay at or below this ceiling.
_INTERVAL_S = 1
_WINDOW_S = 5.5
_MAX_PLAUSIBLE_TICKS = int(_WINDOW_S // _INTERVAL_S) + 1


@pytest.mark.asyncio
async def test_two_schedulers_share_one_body_run_per_tick(
    flushed_redis,
) -> None:
    metrics.reset_all_for_tests()

    job_id = "leader_lock_smoke"
    fire_count: CCounter[str] = CCounter()

    async def body_a() -> None:
        fire_count["A"] += 1

    async def body_b() -> None:
        fire_count["B"] += 1

    a = APSchedulerAdapter(redis=flushed_redis)
    b = APSchedulerAdapter(redis=flushed_redis)
    a.schedule_interval(job_id=job_id, func=body_a, seconds=_INTERVAL_S)
    b.schedule_interval(job_id=job_id, func=body_b, seconds=_INTERVAL_S)

    await a.start()
    await b.start()
    try:
        await asyncio.sleep(_WINDOW_S)
    finally:
        await a.shutdown()
        await b.shutdown()

    total_runs = fire_count["A"] + fire_count["B"]
    acquired = metrics.scheduler_lock_acquired_total.value(job=job_id)
    skipped = metrics.scheduler_lock_skipped_total.value(job=job_id)

    # The gate fired bodies at least once — the schedulers got past start.
    assert total_runs >= 1, "no scheduler tick ever fired its body"
    # The acquire counter and body runs are inseparable by construction.
    assert acquired == total_runs
    # Without the gate, two schedulers would each fire every tick → up to
    # 2 * _MAX_PLAUSIBLE_TICKS bodies. With the gate, no more than the
    # single-replica ceiling can run.
    assert total_runs <= _MAX_PLAUSIBLE_TICKS, (
        f"too many runs: {total_runs} > {_MAX_PLAUSIBLE_TICKS} — gate not holding"
    )
    # The second replica observed the lock as held at least once.
    assert skipped >= 1, "second scheduler never skipped — gate inactive"


@pytest.mark.asyncio
async def test_single_scheduler_increments_acquired_counter(
    flushed_redis,
) -> None:
    """No peer ⇒ every successful body run also increments the acquire
    counter. Locks the additive contract that the gate doesn't suppress
    runs in the no-contention case."""
    metrics.reset_all_for_tests()

    job_id = "leader_lock_solo"
    fired = 0

    async def body() -> None:
        nonlocal fired
        fired += 1

    sched = APSchedulerAdapter(redis=flushed_redis)
    sched.schedule_interval(job_id=job_id, func=body, seconds=_INTERVAL_S)
    await sched.start()
    try:
        await asyncio.sleep(3.5)
    finally:
        await sched.shutdown()

    assert fired >= 1
    assert metrics.scheduler_lock_acquired_total.value(job=job_id) == fired
