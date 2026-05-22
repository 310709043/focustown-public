"""Unit tests for MatchingQueueService.

Coverage per the unit-testing skill rules: logic / boundary / error /
object-state. Each test exercises one observable property of the
service. The queue is an in-memory fake so we don't need Redis; the
Redis adapter's atomicity is exercised in integration tests.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest

from app.core.events import EventBus
from app.domain.models import User
from app.domain.repositories.match_queue import IMatchingQueue, WaitEntry
from app.domain.repositories.match_waiting_pool_repo import (
    IMatchWaitingPoolRepo,
    WaitingPoolRecord,
)
from app.domain.services.matching_queue_service import (
    DEFAULT_BOT_FALLBACK_MAX_MS,
    DEFAULT_BOT_FALLBACK_MIN_MS,
    MatchedResult,
    MatchingQueueService,
    WaitingResult,
)
from app.domain.services.matching_service import MatchingService
from tests.unit.fakes import (
    FakeClock,
    FakeCompatibilityStrategy,
    FakeFocusSessionRepo,
    FakeIdGen,
    FakeMatchRepo,
    FakeUserRepo,
    RecordingPublisher,
)

# ── Helpers ────────────────────────────────────────────────────────────


@dataclass
class FakeMatchingQueue(IMatchingQueue):
    """Dict-backed waiting pool. Preserves insertion order via ``dict``
    iteration (PEP 468) which is what ``list_waiters`` returns —
    matching the FIFO contract of the Redis ZSET adapter."""

    entries: dict[str, WaitEntry] = field(default_factory=dict)

    async def enqueue(
        self,
        user_id: str,
        *,
        enqueued_at_ms: int,
        fallback_deadline_ms: int,
    ) -> bool:
        if user_id in self.entries:
            return False
        self.entries[user_id] = WaitEntry(
            user_id=user_id,
            enqueued_at_ms=enqueued_at_ms,
            fallback_deadline_ms=fallback_deadline_ms,
        )
        return True

    async def cancel(self, user_id: str) -> bool:
        return self.entries.pop(user_id, None) is not None

    async def is_waiting(self, user_id: str) -> WaitEntry | None:
        return self.entries.get(user_id)

    async def list_waiters(self) -> list[WaitEntry]:
        return list(self.entries.values())

    async def atomic_remove_pair(self, a: str, b: str) -> bool:
        if a not in self.entries or b not in self.entries:
            return False
        self.entries.pop(a)
        self.entries.pop(b)
        return True

    async def list_due_for_fallback(self, *, now_ms: int) -> list[WaitEntry]:
        return [
            entry
            for entry in self.entries.values()
            if entry.fallback_deadline_ms <= now_ms
        ]


@dataclass
class FakeWaitingPoolRepo(IMatchWaitingPoolRepo):
    """In-memory stand-in for the PG source-of-truth repo.

    Mirrors the SQL adapter's status transitions without touching a
    database. The unit suite asserts the service writes PG-then-Redis
    via this fake's recorded state; the SQL semantics (on-conflict,
    atomic UPDATE) are covered by the integration suite.
    """

    rows: dict[str, WaitingPoolRecord] = field(default_factory=dict)

    async def upsert_waiting(
        self,
        user_id: str,
        *,
        enqueued_at_ms: int,
        fallback_deadline_ms: int,
    ) -> None:
        self.rows[user_id] = WaitingPoolRecord(
            user_id=user_id,
            status="waiting",
            enqueued_at_ms=enqueued_at_ms,
            fallback_deadline_ms=fallback_deadline_ms,
            match_id=None,
        )

    def _set(
        self,
        user_id: str,
        *,
        status: str,
        match_id: str | None = None,
    ) -> None:
        existing = self.rows.get(user_id)
        if existing is None:
            return
        self.rows[user_id] = WaitingPoolRecord(
            user_id=existing.user_id,
            status=status,  # type: ignore[arg-type]
            enqueued_at_ms=existing.enqueued_at_ms,
            fallback_deadline_ms=existing.fallback_deadline_ms,
            match_id=match_id if match_id is not None else existing.match_id,
        )

    async def mark_paired(self, user_id: str, *, match_id: str) -> None:
        self._set(user_id, status="paired", match_id=match_id)

    async def mark_pair_paired(
        self, user_a: str, user_b: str, *, match_id: str
    ) -> None:
        self._set(user_a, status="paired", match_id=match_id)
        self._set(user_b, status="paired", match_id=match_id)

    async def mark_cancelled(self, user_id: str) -> None:
        self._set(user_id, status="cancelled")

    async def mark_bot_fallback(self, user_id: str) -> None:
        self._set(user_id, status="bot_fallback")

    async def list_waiting(self) -> list[WaitingPoolRecord]:
        return [r for r in self.rows.values() if r.status == "waiting"]

    async def get(self, user_id: str) -> WaitingPoolRecord | None:
        return self.rows.get(user_id)


def _user(uid: str, *, is_bot: bool = False) -> User:
    return User(
        id=uid,
        email=f"{uid}@example.test",
        display_name=uid,
        character_key=f"char-{uid}",
        role_label=None,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
        is_bot=is_bot,
    )


def _build_service(
    *,
    users: list[User],
    clock: FakeClock | None = None,
    queue: FakeMatchingQueue | None = None,
    pool: FakeWaitingPoolRepo | None = None,
    rng: random.Random | None = None,
) -> tuple[
    MatchingQueueService,
    FakeMatchingQueue,
    RecordingPublisher,
    FakeMatchRepo,
    FakeUserRepo,
    FakeClock,
    FakeWaitingPoolRepo,
]:
    clock = clock or FakeClock(datetime(2026, 5, 21, 12, 0, 0, tzinfo=UTC))
    queue = queue or FakeMatchingQueue()
    pool = pool or FakeWaitingPoolRepo()
    publisher = RecordingPublisher()
    user_repo = FakeUserRepo.from_users(users)
    match_repo = FakeMatchRepo()
    session_repo = FakeFocusSessionRepo()
    matching = MatchingService(
        users=user_repo,
        matches=match_repo,
        sessions=session_repo,
        strategy=FakeCompatibilityStrategy(score_value=72, reason_text="ok"),
        events=EventBus(),
        ids=FakeIdGen(),
        clock=clock,
    )
    svc = MatchingQueueService(
        queue=queue,
        pool=pool,
        matching=matching,
        matches_reader=match_repo,
        users=user_repo,
        publisher=publisher,
        clock=clock,
        rng=rng or random.Random(0),  # noqa: S311
    )
    return svc, queue, publisher, match_repo, user_repo, clock, pool


# ── logic ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_request_with_empty_pool_returns_waiting() -> None:
    svc, queue, publisher, _matches, _users, _clock, _pool = _build_service(
        users=[_user("alice")]
    )

    result = await svc.request(requester_id="alice")

    assert isinstance(result, WaitingResult)
    assert result.enqueued_at_ms > 0
    assert (
        result.enqueued_at_ms + DEFAULT_BOT_FALLBACK_MIN_MS
        <= result.bot_fallback_at_ms
        <= result.enqueued_at_ms + DEFAULT_BOT_FALLBACK_MAX_MS
    )
    assert "alice" in queue.entries
    # No pair → no WS publish
    assert publisher.published == []


@pytest.mark.asyncio
async def test_request_with_existing_waiter_pairs_immediately() -> None:
    svc, queue, publisher, match_repo, _users, _clock, _pool = _build_service(
        users=[_user("alice"), _user("bob")]
    )
    # alice is already waiting
    await svc.request(requester_id="alice")
    assert "alice" in queue.entries

    result = await svc.request(requester_id="bob")

    assert isinstance(result, MatchedResult)
    assert result.via == "waiting_pool"
    assert "alice" not in queue.entries
    assert "bob" not in queue.entries
    assert result.match.requester_id == "bob"
    assert result.match.candidate_id == "alice"
    # Both sides notified with rich payload
    channels = [c for c, _p in publisher.published]
    assert "user:alice" in channels
    assert "user:bob" in channels


@pytest.mark.asyncio
async def test_sweep_pairs_two_waiters() -> None:
    svc, queue, publisher, _matches, _users, clock, _pool = _build_service(
        users=[_user("alice"), _user("bob")]
    )
    # Both enqueue in sequence — bob arrives ~1s after alice via FakeClock
    await svc.request(requester_id="alice")
    clock.advance(timedelta(seconds=1))
    # Avoid the immediate-pair path so the sweep gets exercised: insert
    # bob directly without going through ``request``.
    await queue.enqueue(
        "bob",
        enqueued_at_ms=int(clock.now().timestamp() * 1000),
        fallback_deadline_ms=int(clock.now().timestamp() * 1000) + 30_000,
    )
    assert len(queue.entries) == 2

    await svc.sweep()

    assert queue.entries == {}
    channels = {c for c, _p in publisher.published}
    assert channels == {"user:alice", "user:bob"}


@pytest.mark.asyncio
async def test_sweep_falls_back_to_bot_after_deadline() -> None:
    svc, queue, publisher, match_repo, _users, clock, _pool = _build_service(
        users=[_user("alice"), _user("bot-1", is_bot=True)]
    )
    # Enqueue alice with a deadline already in the past
    past_ms = int(clock.now().timestamp() * 1000) - 1_000
    await queue.enqueue(
        "alice",
        enqueued_at_ms=past_ms,
        fallback_deadline_ms=past_ms,
    )

    await svc.sweep()

    assert "alice" not in queue.entries
    # Bot fallback creates an accepted match
    assert len(match_repo.rows) == 1
    match = next(iter(match_repo.rows.values()))
    assert match.requester_id == "alice"
    assert match.candidate_id == "bot-1"
    assert match.status.value == "accepted"
    # User was notified via bot_fallback channel
    assert any(
        c == "user:alice" and p.get("via") == "bot_fallback"
        for c, p in publisher.published
    )


@pytest.mark.asyncio
async def test_request_skips_dedup_partner_and_enqueues() -> None:
    """If the only available waiter is in the requester's recent-14
    match window, the requester should be enqueued (not paired) — sweep
    will try the same combination again only if no fresher waiter
    arrives, and the bot-fallback timer still fires."""
    svc, queue, publisher, match_repo, _users, _clock, _pool = _build_service(
        users=[_user("alice"), _user("bob")]
    )
    # Pre-seed match history: bob is alice's recent partner
    await match_repo.create(
        match_id="prior",
        requester_id="alice",
        candidate_id="bob",
        compatibility=70,
        reason="prior",
    )
    # bob is waiting; alice requests
    await svc.request(requester_id="bob")

    result = await svc.request(requester_id="alice")

    assert isinstance(result, WaitingResult)
    assert "alice" in queue.entries
    assert "bob" in queue.entries
    assert publisher.published == []


# ── boundary ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pair_chooses_oldest_waiter_first() -> None:
    """FIFO: when multiple waiters are eligible, the requester pairs with
    the one who joined first."""
    svc, queue, publisher, match_repo, _users, clock, _pool = _build_service(
        users=[_user("alice"), _user("bob"), _user("carol")]
    )
    await queue.enqueue(
        "alice",
        enqueued_at_ms=int(clock.now().timestamp() * 1000) - 5_000,
        fallback_deadline_ms=int(clock.now().timestamp() * 1000) + 25_000,
    )
    await queue.enqueue(
        "bob",
        enqueued_at_ms=int(clock.now().timestamp() * 1000) - 2_000,
        fallback_deadline_ms=int(clock.now().timestamp() * 1000) + 28_000,
    )

    result = await svc.request(requester_id="carol")

    assert isinstance(result, MatchedResult)
    # alice was older → carol pairs with alice, bob remains waiting
    assert result.match.candidate_id == "alice"
    assert "bob" in queue.entries


@pytest.mark.asyncio
async def test_fallback_at_exactly_deadline_fires() -> None:
    """Boundary: deadline_ms <= now_ms is the fallback predicate, so
    equality should also trigger the bot fallback."""
    svc, queue, publisher, match_repo, _users, clock, _pool = _build_service(
        users=[_user("alice"), _user("bot-1", is_bot=True)]
    )
    now_ms = int(clock.now().timestamp() * 1000)
    await queue.enqueue(
        "alice",
        enqueued_at_ms=now_ms - 30_000,
        fallback_deadline_ms=now_ms,  # exactly now
    )

    await svc.sweep()

    assert "alice" not in queue.entries
    assert len(match_repo.rows) == 1


# ── error ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_double_request_returns_existing_waiting_state() -> None:
    """Idempotency: a second ``request`` while already waiting must not
    create a new entry or change the deadline — both UI tabs see the
    same elapsed counter."""
    svc, queue, _publisher, _matches, _users, _clock, _pool = _build_service(
        users=[_user("alice")]
    )

    first = await svc.request(requester_id="alice")
    second = await svc.request(requester_id="alice")

    assert isinstance(first, WaitingResult)
    assert isinstance(second, WaitingResult)
    assert second.enqueued_at_ms == first.enqueued_at_ms
    assert second.bot_fallback_at_ms == first.bot_fallback_at_ms
    assert len(queue.entries) == 1


@pytest.mark.asyncio
async def test_bot_fallback_with_no_bots_clears_queue() -> None:
    """When no bots exist, an overdue waiter should still be removed
    from the queue so they don't loop forever — the user will re-enqueue
    if they still want to match."""
    svc, queue, _publisher, match_repo, _users, clock, _pool = _build_service(
        users=[_user("alice")]
    )
    now_ms = int(clock.now().timestamp() * 1000)
    await queue.enqueue(
        "alice",
        enqueued_at_ms=now_ms - 30_000,
        fallback_deadline_ms=now_ms - 1,
    )

    await svc.sweep()

    assert "alice" not in queue.entries
    assert match_repo.rows == {}


# ── object-state ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cancel_removes_user_from_queue() -> None:
    svc, queue, _publisher, _matches, _users, _clock, _pool = _build_service(
        users=[_user("alice")]
    )
    await svc.request(requester_id="alice")
    assert "alice" in queue.entries

    await svc.cancel(user_id="alice")

    assert "alice" not in queue.entries


@pytest.mark.asyncio
async def test_status_returns_none_when_not_waiting() -> None:
    svc, _queue, _publisher, _matches, _users, _clock, _pool = _build_service(
        users=[_user("alice")]
    )

    entry = await svc.status(user_id="alice")

    assert entry is None


@pytest.mark.asyncio
async def test_pair_creates_pending_match_in_repo() -> None:
    """Object-state: after pairing, the match repo has exactly one row
    with status=pending (the queue does not auto-accept real-real pairs)."""
    svc, _queue, _publisher, match_repo, _users, _clock, _pool = _build_service(
        users=[_user("alice"), _user("bob")]
    )
    await svc.request(requester_id="alice")

    result = await svc.request(requester_id="bob")

    assert isinstance(result, MatchedResult)
    assert len(match_repo.rows) == 1
    row = next(iter(match_repo.rows.values()))
    assert row.status.value == "pending"
