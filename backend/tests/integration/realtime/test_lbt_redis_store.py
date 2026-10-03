"""RedisLbtStore against a real Redis: TTLs, lock exclusivity, queue
self-healing and close semantics the in-memory fake cannot vouch for."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.models.lbt import LbtConversation, LbtProfile, LbtWaiting
from app.domain.repositories.lbt import LbtTranscriptLine
from app.infrastructure.lbt.redis_store import TRANSCRIPT_MAX_LINES, RedisLbtStore

pytestmark = pytest.mark.asyncio

T0 = datetime(2026, 10, 3, 13, 0, tzinfo=UTC)
PROFILE = LbtProfile("小橘", 1, "listen")


@pytest.fixture
def store(flushed_redis) -> RedisLbtStore:
    return RedisLbtStore(flushed_redis)


def conversation(cid: str = "c1") -> LbtConversation:
    return LbtConversation(
        id=cid,
        guest_a="g_a",
        guest_b="g_b",
        profile_a=PROFILE,
        profile_b=LbtProfile("阿樹", 2, "story"),
        started_at=T0,
        ends_at=T0 + timedelta(seconds=420),
    )


async def test_online_count_only_includes_recent_guests(store):
    await store.touch_online("g_old", T0 - timedelta(minutes=5))
    await store.touch_online("g_new", T0)

    assert await store.count_online(T0 - timedelta(minutes=1)) == 1


async def test_prune_online_removes_stale_guests(store):
    await store.touch_online("g_old", T0 - timedelta(minutes=5))
    await store.touch_online("g_new", T0)

    await store.prune_online(T0 - timedelta(minutes=1))

    assert (await store.last_seen("g_old"), await store.last_seen("g_new")) == (None, T0)


async def test_queue_round_trips_profiles_in_join_order(store):
    await store.enqueue(LbtWaiting("g_b", PROFILE, T0 + timedelta(seconds=5)))
    await store.enqueue(LbtWaiting("g_a", PROFILE, T0))

    assert [w.guest_id for w in await store.list_waiting()] == ["g_a", "g_b"]


async def test_waiting_profile_has_a_ttl(store, flushed_redis):
    await store.enqueue(LbtWaiting("g_a", PROFILE, T0))

    assert 0 < await flushed_redis.ttl("lbt:waiting:g_a") <= 3600


async def test_list_waiting_drops_entries_whose_profile_expired(store, flushed_redis):
    await store.enqueue(LbtWaiting("g_a", PROFILE, T0))
    await flushed_redis.delete("lbt:waiting:g_a")

    await store.list_waiting()

    assert await flushed_redis.zscore("lbt:queue", "g_a") is None


async def test_dequeue_reports_whether_anything_was_removed(store):
    await store.enqueue(LbtWaiting("g_a", PROFILE, T0))

    assert (await store.dequeue("g_a"), await store.dequeue("g_a")) == (True, False)


async def test_pairing_lock_is_exclusive(store):
    async with store.pairing_lock() as first:
        async with store.pairing_lock() as second:
            assert (first, second) == (True, False)


async def test_pairing_lock_is_released_after_use(store):
    async with store.pairing_lock():
        pass

    async with store.pairing_lock() as again:
        assert again is True


async def test_saved_conversation_is_found_from_both_guests(store):
    await store.save_conversation(conversation())

    assert (
        await store.conversation_id_of("g_a"),
        await store.conversation_id_of("g_b"),
        await store.active_conversation_ids(),
        await store.get_conversation("c1"),
    ) == ("c1", "c1", ["c1"], conversation())


async def test_close_unlinks_guests_and_expires_data(store, flushed_redis):
    await store.save_conversation(conversation())
    await store.append_line("c1", LbtTranscriptLine("l1", "g_a", "hi", T0))

    await store.close_conversation(conversation(), keep_for=timedelta(hours=24))

    assert (
        await store.conversation_id_of("g_a"),
        await store.last_conversation_id_of("g_b"),
        await store.active_conversation_ids(),
        0 < await flushed_redis.ttl("lbt:transcript:c1") <= 86400,
        0 < await flushed_redis.ttl("lbt:conv:c1") <= 86400,
    ) == (None, "c1", [], True, True)


async def test_transcript_keeps_order_and_is_capped(store):
    for i in range(TRANSCRIPT_MAX_LINES + 5):
        await store.append_line("c1", LbtTranscriptLine(f"l{i}", "g_a", str(i), T0))

    lines = await store.transcript("c1")
    assert (len(lines), lines[0].text, lines[-1].text) == (
        TRANSCRIPT_MAX_LINES,
        "5",
        str(TRANSCRIPT_MAX_LINES + 4),
    )


async def test_block_pair_is_symmetric_and_expires(store, flushed_redis):
    await store.block_pair("g_a", "g_b", timedelta(hours=24))

    assert (
        await store.blocked_for("g_a"),
        await store.blocked_for("g_b"),
        0 < await flushed_redis.ttl("lbt:blocked:g_a") <= 86400,
    ) == ({"g_b"}, {"g_a"}, True)


async def test_concurrent_extend_votes_complete_exactly_once(store):
    results = await asyncio.gather(
        store.add_extend_vote("c1", "g_a"), store.add_extend_vote("c1", "g_b")
    )

    assert sorted(results) == [False, True]


async def test_repeated_vote_from_one_guest_never_completes(store):
    first = await store.add_extend_vote("c1", "g_a")
    second = await store.add_extend_vote("c1", "g_a")

    assert (first, second, await store.extend_votes("c1")) == (False, False, {"g_a"})


async def test_completed_votes_are_cleared(store):
    await store.add_extend_vote("c1", "g_a")
    await store.add_extend_vote("c1", "g_b")

    assert await store.extend_votes("c1") == set()


async def test_closing_drops_pending_votes(store):
    await store.save_conversation(conversation())
    await store.add_extend_vote("c1", "g_a")

    await store.close_conversation(conversation(), keep_for=timedelta(hours=24))

    assert await store.extend_votes("c1") == set()
