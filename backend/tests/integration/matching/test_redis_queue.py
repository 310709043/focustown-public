"""Integration tests for RedisMatchingQueue.

These tests exercise the parts the in-memory FakeMatchingQueue cannot
honestly stand in for:
  - ``ZADD NX`` idempotency of enqueue
  - Lua-script atomicity of ``atomic_remove_pair`` under concurrent
    sweep ticks (the whole point of the script)
  - HASH TTL semantics (the safety-net for crashed processes)
  - ``list_waiters`` self-pruning of dangling ZSET members when the
    HASH is missing
"""

from __future__ import annotations

import asyncio

import pytest

from app.infrastructure.matching.redis_queue import RedisMatchingQueue

pytestmark = pytest.mark.asyncio


@pytest.fixture
def queue(flushed_redis):
    return RedisMatchingQueue(flushed_redis)


async def test_enqueue_first_call_adds_user(queue, flushed_redis):
    added = await queue.enqueue(
        "alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000
    )

    assert added is True
    assert await flushed_redis.zscore("match:wait:queue", "alice") == 1_000


async def test_enqueue_second_call_for_same_user_is_idempotent(queue):
    await queue.enqueue("alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000)

    second = await queue.enqueue(
        "alice", enqueued_at_ms=9_000, fallback_deadline_ms=10_000
    )

    assert second is False
    entry = await queue.is_waiting("alice")
    assert entry is not None
    assert entry.enqueued_at_ms == 1_000  # first values preserved


async def test_cancel_removes_from_zset_and_hash(queue, flushed_redis):
    await queue.enqueue("alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000)

    removed = await queue.cancel("alice")

    assert removed is True
    assert await flushed_redis.zscore("match:wait:queue", "alice") is None
    assert await flushed_redis.exists("match:wait:user:alice") == 0


async def test_atomic_remove_pair_removes_both_when_both_present(queue):
    await queue.enqueue("alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000)
    await queue.enqueue("bob", enqueued_at_ms=1_100, fallback_deadline_ms=2_100)

    ok = await queue.atomic_remove_pair("alice", "bob")

    assert ok is True
    assert await queue.list_waiters() == []


async def test_atomic_remove_pair_no_op_when_one_side_missing(queue):
    await queue.enqueue("alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000)

    # bob never enqueued
    ok = await queue.atomic_remove_pair("alice", "bob")

    assert ok is False
    # alice was not removed — the script must NOT half-commit
    entry = await queue.is_waiting("alice")
    assert entry is not None


async def test_atomic_remove_pair_concurrent_only_one_wins(queue):
    """Two parallel sweeps racing to pair alice with different partners —
    only one ZREM is allowed to commit. Without the Lua, both could win
    and we'd over-pair alice."""
    await queue.enqueue("alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000)
    await queue.enqueue("bob", enqueued_at_ms=1_100, fallback_deadline_ms=2_100)
    await queue.enqueue("carol", enqueued_at_ms=1_200, fallback_deadline_ms=2_200)

    results = await asyncio.gather(
        queue.atomic_remove_pair("alice", "bob"),
        queue.atomic_remove_pair("alice", "carol"),
    )

    assert results.count(True) == 1
    assert results.count(False) == 1
    survivors = {w.user_id for w in await queue.list_waiters()}
    # Exactly one of bob/carol survives (the side that lost the race)
    assert survivors in ({"bob"}, {"carol"})


async def test_list_waiters_self_prunes_dangling_zset_members(queue, flushed_redis):
    """If a HASH expires but the ZSET member is still there (e.g. the
    cancel hook failed), ``list_waiters`` must filter it out AND remove
    the dangling ZSET entry so subsequent reads stay clean."""
    await queue.enqueue("alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000)
    # Simulate TTL expiry of the per-user HASH
    await flushed_redis.delete("match:wait:user:alice")

    waiters = await queue.list_waiters()

    assert waiters == []
    assert await flushed_redis.zscore("match:wait:queue", "alice") is None


async def test_list_due_for_fallback_filters_by_deadline(queue):
    await queue.enqueue("alice", enqueued_at_ms=100, fallback_deadline_ms=1_000)
    await queue.enqueue("bob", enqueued_at_ms=200, fallback_deadline_ms=5_000)

    due = await queue.list_due_for_fallback(now_ms=2_000)

    assert {entry.user_id for entry in due} == {"alice"}
