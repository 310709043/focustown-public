"""LbtService — the live LowBatteryTown flow, driven through in-memory
ports. Frames published per guest channel are the observable contract."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, time, timedelta

import pytest

from app.domain.services.lbt_rules import LbtInputError
from app.domain.services.lbt_service import LbtConfig, LbtService, guest_channel
from tests.unit.fakes import FakeClock, FakeIdGen, RecordingPublisher
from tests.unit.lbt_fakes import InMemoryLbtReportRepo, InMemoryLbtStore

T0 = datetime(2026, 10, 3, 13, 0, tzinfo=UTC)  # 21:00 Asia/Taipei
CFG = LbtConfig()

LISTEN = {"nickname": "小橘", "energy": 1, "preference": "listen"}
STORY = {"nickname": "阿樹", "energy": 2, "preference": "story"}


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(current=T0)


@pytest.fixture
def store() -> InMemoryLbtStore:
    return InMemoryLbtStore()


@pytest.fixture
def pub() -> RecordingPublisher:
    return RecordingPublisher()


@pytest.fixture
def reports() -> InMemoryLbtReportRepo:
    return InMemoryLbtReportRepo()


@pytest.fixture
def svc(store, pub, clock, reports) -> LbtService:
    return LbtService(
        store=store, publisher=pub, clock=clock, ids=FakeIdGen(), config=CFG, reports=reports
    )


def frames(pub: RecordingPublisher, guest: str, kind: str | None = None) -> list[dict]:
    return [
        p
        for ch, p in pub.published
        if ch == guest_channel(guest) and (kind is None or p["type"] == kind)
    ]


async def pair(svc: LbtService) -> str:
    await svc.join("g_a", LISTEN, adult=True)
    await svc.join("g_b", STORY, adult=True)
    return (await svc._store.conversation_id_of("g_a")) or ""


# ── joining ─────────────────────────────────────────────────────────────


async def test_join_without_age_confirmation_is_rejected(svc):
    with pytest.raises(LbtInputError) as exc:
        await svc.join("g_a", LISTEN, adult=False)

    assert exc.value.code == "age_required"


async def test_join_outside_opening_hours_is_rejected(store, pub, clock):
    closed = LbtService(
        store=store,
        publisher=pub,
        clock=clock,
        ids=FakeIdGen(),
        config=LbtConfig(open_hours=(time(9, 0), time(10, 0))),
    )

    with pytest.raises(LbtInputError) as exc:
        await closed.join("g_a", LISTEN, adult=True)

    assert exc.value.code == "closed"


async def test_join_with_a_bad_profile_is_rejected(svc):
    with pytest.raises(LbtInputError) as exc:
        await svc.join("g_a", {"nickname": "x", "energy": 9, "preference": "casual"}, adult=True)

    assert exc.value.code == "invalid_energy"


async def test_a_lone_joiner_waits(svc, store, pub):
    await svc.join("g_a", LISTEN, adult=True)

    assert (list(store.queue), frames(pub, "g_a", "lbt.waiting") != []) == (["g_a"], True)


async def test_two_compatible_joiners_are_paired_and_leave_the_queue(svc, store):
    await pair(svc)

    assert (store.queue, len(store.active)) == ({}, 1)


async def test_each_side_learns_the_other_profile_but_not_their_id(svc, pub):
    await pair(svc)

    matched = frames(pub, "g_a", "lbt.matched")[0]
    assert (matched["partner"], "g_b" in str(matched)) == (
        {"nickname": "阿樹", "energy": 2, "preference": "story"},
        False,
    )


async def test_matched_frame_carries_the_server_clock_and_end(svc, pub):
    await pair(svc)

    matched = frames(pub, "g_b", "lbt.matched")[0]
    assert (matched["ends_at"], matched["server_now"], matched["grace_seconds"]) == (
        (T0 + CFG.session).isoformat(),
        T0.isoformat(),
        60,
    )


async def test_joining_while_in_a_conversation_is_rejected(svc):
    await pair(svc)

    with pytest.raises(LbtInputError) as exc:
        await svc.join("g_a", LISTEN, adult=True)

    assert exc.value.code == "already_in_conversation"


async def test_poor_matches_wait_until_the_relax_time(svc, store, clock):
    await svc.join("g_a", LISTEN, adult=True)
    await svc.join("g_b", {**LISTEN, "nickname": "b", "energy": 3}, adult=True)

    clock.advance(CFG.relax_after)
    await svc.sweep()

    assert len(store.active) == 1


async def test_poor_matches_are_not_paired_before_the_relax_time(svc, store):
    await svc.join("g_a", LISTEN, adult=True)
    await svc.join("g_b", {**LISTEN, "nickname": "b", "energy": 3}, adult=True)

    assert len(store.active) == 0


async def test_pairing_is_skipped_while_another_process_holds_the_lock(svc, store):
    store.lock_held = True
    await svc.join("g_a", LISTEN, adult=True)
    await svc.join("g_b", STORY, adult=True)

    assert len(store.queue) == 2


async def test_cancel_leaves_the_queue(svc, store):
    await svc.join("g_a", LISTEN, adult=True)

    await svc.cancel("g_a")

    assert store.queue == {}


async def test_four_joiners_make_two_conversations(svc, store):
    for gid, profile in [("g_1", LISTEN), ("g_2", STORY), ("g_3", LISTEN), ("g_4", STORY)]:
        await svc.join(gid, profile, adult=True)

    assert len(store.active) == 2


# ── talking ─────────────────────────────────────────────────────────────


async def test_a_message_reaches_both_sides_with_their_own_perspective(svc, pub):
    await pair(svc)

    await svc.send_message("g_a", "  今天有點累  ")

    seen = (frames(pub, "g_a", "lbt.message")[0], frames(pub, "g_b", "lbt.message")[0])
    assert [(f["from"], f["text"]) for f in seen] == [
        ("me", "今天有點累"),
        ("partner", "今天有點累"),
    ]


async def test_messages_are_kept_in_the_transcript(svc, store):
    cid = await pair(svc)

    await svc.send_message("g_b", "hi")

    assert [line.text for line in store.transcripts[cid]] == ["hi"]


async def test_contact_details_are_hidden_from_both_sides_and_the_transcript(svc, pub, store):
    cid = await pair(svc)

    await svc.send_message("g_a", "加我 line.me/abc 或 0912-345-678")

    texts = {f["text"] for g in ("g_a", "g_b") for f in frames(pub, g, "lbt.message")}
    assert texts == {"加我 ••• 或 •••"}
    assert [line.text for line in store.transcripts[cid]] == ["加我 ••• 或 •••"]


@pytest.mark.parametrize("text", ["", "   ", None, 123])
async def test_empty_or_non_text_messages_are_rejected(svc, text):
    await pair(svc)

    with pytest.raises(LbtInputError) as exc:
        await svc.send_message("g_a", text)

    assert exc.value.code == "empty_message"


async def test_a_message_without_a_conversation_is_rejected(svc):
    with pytest.raises(LbtInputError) as exc:
        await svc.send_message("g_a", "hi")

    assert exc.value.code == "no_conversation"


async def test_messages_after_time_is_up_are_rejected(svc, clock):
    await pair(svc)
    clock.advance(CFG.session)

    with pytest.raises(LbtInputError) as exc:
        await svc.send_message("g_a", "one more")

    assert exc.value.code == "time_up"


async def test_long_messages_are_capped(svc, pub):
    await pair(svc)

    await svc.send_message("g_a", "字" * 600)

    assert len(frames(pub, "g_b", "lbt.message")[0]["text"]) == 500


async def test_typing_is_sent_to_the_partner_only(svc, pub):
    await pair(svc)

    await svc.typing("g_a")

    assert (len(frames(pub, "g_b", "lbt.typing")), len(frames(pub, "g_a", "lbt.typing"))) == (1, 0)


# ── extending ───────────────────────────────────────────────────────────


async def test_one_side_asking_tells_both_who_asked(svc, pub):
    await pair(svc)

    await svc.extend("g_a")

    assert (
        frames(pub, "g_a", "lbt.extend_requested")[0]["by"],
        frames(pub, "g_b", "lbt.extend_requested")[0]["by"],
    ) == ("me", "partner")


async def test_both_asking_extends_by_one_window(svc, store, pub):
    cid = await pair(svc)

    await svc.extend("g_a")
    await svc.extend("g_b")

    assert (
        store.conversations[cid].ends_at,
        len(frames(pub, "g_a", "lbt.extended")),
        len(frames(pub, "g_b", "lbt.extended")),
    ) == (T0 + CFG.session * 2, 1, 1)


async def test_extending_is_still_possible_during_grace(svc, store, clock):
    cid = await pair(svc)
    clock.advance(CFG.session + timedelta(seconds=30))

    await svc.extend("g_a")
    await svc.extend("g_b")

    assert store.conversations[cid].ends_at == clock.now() + CFG.session


async def test_extending_after_grace_is_rejected(svc, clock):
    await pair(svc)
    clock.advance(CFG.session + CFG.grace)

    with pytest.raises(LbtInputError) as exc:
        await svc.extend("g_a")

    assert exc.value.code == "too_late"


async def test_simultaneous_extend_votes_extend_exactly_once(svc, store, pub):
    """Regression: two processes handling the two votes at the same moment
    must neither lose a vote nor extend twice."""
    cid = await pair(svc)
    store.interleave = True

    await asyncio.gather(svc.extend("g_a"), svc.extend("g_b"))

    assert (
        store.conversations[cid].ends_at,
        len(frames(pub, "g_a", "lbt.extended")),
        len(frames(pub, "g_b", "lbt.extended")),
    ) == (T0 + CFG.session * 2, 1, 1)


async def test_voting_twice_from_one_side_does_not_extend(svc, store):
    cid = await pair(svc)

    await svc.extend("g_a")
    await svc.extend("g_a")

    assert store.conversations[cid].ends_at == T0 + CFG.session


async def test_votes_reset_after_an_extension(svc, store):
    cid = await pair(svc)
    await svc.extend("g_a")
    await svc.extend("g_b")

    await svc.extend("g_a")

    assert (store.conversations[cid].ends_at, store.votes[cid]) == (
        T0 + CFG.session * 2,
        {"g_a"},
    )


# ── leaving ─────────────────────────────────────────────────────────────


async def test_leaving_tells_each_side_why(svc, pub):
    await pair(svc)

    await svc.leave("g_a")

    assert (
        frames(pub, "g_a", "lbt.ended")[0]["reason"],
        frames(pub, "g_b", "lbt.ended")[0]["reason"],
    ) == ("left", "partner_left")


async def test_leaving_closes_the_conversation_and_keeps_it_for_a_day(svc, store):
    cid = await pair(svc)

    await svc.leave("g_b")

    assert (store.active, store.guest_conv, store.closed_keep_for[cid]) == (
        set(),
        {},
        timedelta(hours=24),
    )


async def test_leaving_from_the_waiting_room_dequeues(svc, store):
    await svc.join("g_a", LISTEN, adult=True)

    await svc.leave("g_a")

    assert store.queue == {}


async def test_disconnect_while_waiting_dequeues(svc, store):
    await svc.join("g_a", LISTEN, adult=True)

    await svc.disconnect("g_a")

    assert store.queue == {}


async def test_disconnect_does_not_end_a_conversation_immediately(svc, store):
    await pair(svc)

    await svc.disconnect("g_a")

    assert len(store.active) == 1


# ── reports ─────────────────────────────────────────────────────────────


async def test_report_snapshots_the_transcript_with_roles(svc, reports):
    await pair(svc)
    await svc.send_message("g_a", "hello")
    await svc.send_message("g_b", "rude")

    await svc.report("g_a", "harassment", "  please check  ")

    record = reports.records[0]
    assert (
        [(line["from"], line["text"]) for line in record.transcript],
        record.reported_guest_id,
        record.note,
    ) == ([("reporter", "hello"), ("reported", "rude")], "g_b", "please check")


async def test_report_ends_an_open_conversation(svc, pub):
    await pair(svc)

    await svc.report("g_a", "spam")

    assert (
        frames(pub, "g_a", "lbt.ended")[0]["reason"],
        frames(pub, "g_b", "lbt.ended")[0]["reason"],
    ) == ("reported", "partner_left")


async def test_report_after_the_conversation_ended_still_works(svc, reports):
    await pair(svc)
    await svc.leave("g_b")

    await svc.report("g_a", "sexual")

    assert len(reports.records) == 1


async def test_reported_pairs_are_never_paired_again(svc, store, clock):
    await pair(svc)
    await svc.report("g_a", "harassment")

    await svc.join("g_a", LISTEN, adult=True)
    await svc.join("g_b", STORY, adult=True)
    clock.advance(CFG.relax_after)
    await svc.sweep()

    assert len(store.active) == 0


async def test_report_with_an_unknown_reason_is_rejected(svc):
    await pair(svc)

    with pytest.raises(LbtInputError) as exc:
        await svc.report("g_a", "boring")

    assert exc.value.code == "invalid_reason"


async def test_report_without_any_conversation_is_rejected(svc):
    with pytest.raises(LbtInputError) as exc:
        await svc.report("g_a", "spam")

    assert exc.value.code == "no_conversation"


# ── sweep ───────────────────────────────────────────────────────────────


async def test_sweep_ends_a_conversation_past_grace_as_timeout(svc, store, pub, clock):
    await pair(svc)
    clock.advance(CFG.session + CFG.grace)
    for g in ("g_a", "g_b"):
        await store.touch_online(g, clock.now())

    await svc.sweep()

    assert [f["reason"] for f in frames(pub, "g_a", "lbt.ended")] == ["timeout"]


async def test_sweep_keeps_a_conversation_inside_grace(svc, store, clock):
    await pair(svc)
    clock.advance(CFG.session + CFG.grace - timedelta(seconds=1))
    for g in ("g_a", "g_b"):
        await store.touch_online(g, clock.now())

    await svc.sweep()

    assert len(store.active) == 1


async def test_sweep_ends_a_conversation_when_one_side_vanished(svc, store, pub, clock):
    await pair(svc)
    clock.advance(CFG.offline_after + timedelta(seconds=1))
    await store.touch_online("g_b", clock.now())

    await svc.sweep()

    assert frames(pub, "g_b", "lbt.ended")[0]["reason"] == "partner_disconnected"


async def test_sweep_drops_absent_waiters(svc, store, clock):
    await svc.join("g_a", LISTEN, adult=True)
    clock.advance(CFG.offline_after + timedelta(seconds=1))

    await svc.sweep()

    assert store.queue == {}


# ── reconnect & status ─────────────────────────────────────────────────


async def test_reconnect_replays_the_conversation_and_transcript(svc, pub):
    await pair(svc)
    await svc.send_message("g_b", "still there?")
    await svc.extend("g_b")
    pub.published.clear()

    await svc.connect("g_a")

    assert [f["type"] for f in frames(pub, "g_a")] == [
        "lbt.matched",
        "lbt.message",
        "lbt.extend_requested",
    ]


async def test_reconnect_while_waiting_replays_waiting(svc, pub):
    await svc.join("g_a", LISTEN, adult=True)
    pub.published.clear()

    await svc.connect("g_a")

    assert [f["type"] for f in frames(pub, "g_a")] == ["lbt.waiting"]


async def test_reconnect_after_the_conversation_ended_reports_idle(svc, pub):
    await pair(svc)
    await svc.leave("g_b")
    pub.published.clear()

    await svc.connect("g_a")

    assert [f["type"] for f in frames(pub, "g_a")] == ["lbt.idle"]


async def test_status_counts_recently_seen_guests_and_waiters(svc, store, clock):
    await store.touch_online("g_old", clock.now() - CFG.offline_after - timedelta(seconds=1))
    await store.touch_online("g_new", clock.now())
    await svc.join("g_a", LISTEN, adult=True)

    assert await svc.status() == {"online": 2, "waiting": 1, "open": True, "hours": ""}
