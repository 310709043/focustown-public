"""MatchingService unit tests.

Worth testing:
- ``propose`` rejects self-match (ConflictError)
- ``propose`` rejects unknown user (NotFoundError)
- ``propose`` passes hour-of-day buckets to strategy and persists score+reason
- ``accept`` rejects non-member, rejects non-pending; emits MatchAccepted
- ``skip`` updates status

NOT worth testing:
- The ``from datetime import timedelta`` shuffled inside ``propose`` — not behaviour
- Repo getter pass-through; covered indirectly by accept/skip
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import ConflictError, NotFoundError
from app.domain.events import MatchAccepted, MatchProposed
from app.domain.models import FocusSessionMode, MatchStatus
from app.domain.services.matching_service import MatchingService
from tests.unit.fakes import (
    FakeCompatibilityStrategy,
    FakeFocusSessionRepo,
    FakeMatchRepo,
    FakeUserRepo,
    make_user,
)


@pytest.fixture
def users() -> FakeUserRepo:
    repo = FakeUserRepo()
    requester = make_user("u-alice", display_name="Alice", role_label="UI 設計師")
    candidate = make_user("u-bob", display_name="Bob", role_label="前端工程師")
    repo.users[requester.id] = requester
    repo.users[candidate.id] = candidate
    return repo


@pytest.fixture
def matches() -> FakeMatchRepo:
    return FakeMatchRepo()


@pytest.fixture
def sessions() -> FakeFocusSessionRepo:
    return FakeFocusSessionRepo()


@pytest.fixture
def strategy() -> FakeCompatibilityStrategy:
    return FakeCompatibilityStrategy(score_value=88, reason_text="great fit")


@pytest.fixture
def service(users, matches, sessions, strategy, events, ids, clock) -> MatchingService:
    return MatchingService(
        users=users,
        matches=matches,
        sessions=sessions,
        strategy=strategy,
        events=events,
        ids=ids,
        clock=clock,
    )


# ── propose ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_propose_rejects_self_match(service):
    with pytest.raises(ConflictError):
        await service.propose(requester_id="u-alice", candidate_id="u-alice")


@pytest.mark.asyncio
async def test_propose_rejects_unknown_user(service):
    with pytest.raises(NotFoundError):
        await service.propose(requester_id="u-alice", candidate_id="u-ghost")


@pytest.mark.asyncio
async def test_propose_passes_hour_buckets_to_strategy(service, sessions, strategy):
    await sessions.create(
        session_id="s1",
        user_id="u-alice",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
        started_at=datetime(2026, 5, 14, 9, 30, tzinfo=UTC),
    )
    await sessions.create(
        session_id="s2",
        user_id="u-bob",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
        started_at=datetime(2026, 5, 14, 22, 0, tzinfo=UTC),
    )

    await service.propose(requester_id="u-alice", candidate_id="u-bob")

    assert strategy.calls[0]["requester_focus_starts"] == [9]
    assert strategy.calls[0]["candidate_focus_starts"] == [22]


@pytest.mark.asyncio
async def test_propose_persists_strategy_score_and_reason(service, matches):
    await service.propose(requester_id="u-alice", candidate_id="u-bob")
    stored = next(iter(matches.rows.values()))
    assert stored.compatibility == 88
    assert stored.reason == "great fit"


@pytest.mark.asyncio
async def test_propose_publishes_match_proposed(service, events):
    captured: list = []

    async def record(e):
        captured.append(e)

    events.subscribe(MatchProposed, record)
    await service.propose(requester_id="u-alice", candidate_id="u-bob")
    assert captured == [
        MatchProposed(
            match_id="id-1",
            requester_id="u-alice",
            candidate_id="u-bob",
            compatibility=88,
        )
    ]


# ── accept ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_accept_rejects_unknown_match(service):
    with pytest.raises(NotFoundError):
        await service.accept(match_id="missing", user_id="u-alice")


@pytest.mark.asyncio
async def test_accept_rejects_non_member(service):
    m = await service.propose(requester_id="u-alice", candidate_id="u-bob")
    with pytest.raises(ConflictError):
        await service.accept(match_id=m.id, user_id="u-stranger")


@pytest.mark.asyncio
async def test_accept_rejects_already_accepted(service):
    m = await service.propose(requester_id="u-alice", candidate_id="u-bob")
    await service.accept(match_id=m.id, user_id="u-alice")
    with pytest.raises(ConflictError):
        await service.accept(match_id=m.id, user_id="u-alice")


@pytest.mark.asyncio
async def test_accept_transitions_status(service):
    m = await service.propose(requester_id="u-alice", candidate_id="u-bob")
    accepted = await service.accept(match_id=m.id, user_id="u-bob")
    assert accepted.status is MatchStatus.ACCEPTED


@pytest.mark.asyncio
async def test_accept_publishes_match_accepted(service, events):
    captured: list = []

    async def record(e):
        captured.append(e)

    events.subscribe(MatchAccepted, record)
    m = await service.propose(requester_id="u-alice", candidate_id="u-bob")
    await service.accept(match_id=m.id, user_id="u-bob")
    assert captured == [
        MatchAccepted(
            match_id=m.id,
            requester_id="u-alice",
            candidate_id="u-bob",
        )
    ]


# ── skip ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_skip_rejects_non_member(service):
    m = await service.propose(requester_id="u-alice", candidate_id="u-bob")
    with pytest.raises(ConflictError):
        await service.skip(match_id=m.id, user_id="u-stranger")


@pytest.mark.asyncio
async def test_skip_transitions_status(service):
    m = await service.propose(requester_id="u-alice", candidate_id="u-bob")
    skipped = await service.skip(match_id=m.id, user_id="u-alice")
    assert skipped.status is MatchStatus.SKIPPED
