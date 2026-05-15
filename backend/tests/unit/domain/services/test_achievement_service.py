"""AchievementService unit tests.

Worth testing:
- 7-day streak grants ``streak_7`` only when 7 distinct days exist in window
- ``sprint_15`` grants when count_completed_today >= 15
- ``night_owl`` grants only when hour < 6 or hour >= 22
- Idempotency: repeat events do not create duplicate grants
- Subscriber registers on construction (event publish actually fires it)

NOT worth testing:
- ``list_for_user`` — pure repo pass-through
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.domain.events import SessionCompleted
from app.domain.models import FocusSessionMode, FocusSessionStatus
from app.domain.services.achievement_service import AchievementService
from tests.unit.fakes import FakeAchievementRepo, FakeFocusSessionRepo


@pytest.fixture
def achievements() -> FakeAchievementRepo:
    return FakeAchievementRepo()


@pytest.fixture
def sessions() -> FakeFocusSessionRepo:
    return FakeFocusSessionRepo()


@pytest.fixture
def service(achievements, sessions, clock, events) -> AchievementService:
    return AchievementService(
        achievements=achievements,
        sessions=sessions,
        clock=clock,
        events=events,
    )


async def _seed_completed_sessions(
    sessions: FakeFocusSessionRepo,
    *,
    user_id: str,
    started_ats: list[datetime],
) -> None:
    for i, started_at in enumerate(started_ats):
        s = await sessions.create(
            session_id=f"s-{user_id}-{i}",
            user_id=user_id,
            mode=FocusSessionMode.FOCUS,
            duration_seconds=600,
            task_label=None,
            partner_user_id=None,
            started_at=started_at,
        )
        await sessions.update_status(
            session_id=s.id,
            status=FocusSessionStatus.COMPLETED,
            elapsed_seconds=600,
            ended_at=started_at + timedelta(seconds=600),
        )


def _event(user_id: str = "u1") -> SessionCompleted:
    return SessionCompleted(
        session_id="s-trigger",
        user_id=user_id,
        partner_user_id=None,
        duration_seconds=600,
        ended_at=datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC),
    )


# ── streak_7 ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_streak_7_granted_when_seven_distinct_days(
    service, achievements, sessions, clock
):
    days = [clock.current - timedelta(days=d) for d in range(7)]
    await _seed_completed_sessions(sessions, user_id="u1", started_ats=days)

    await service._on_session_completed(_event(user_id="u1"))

    assert ("u1", "streak_7") in achievements.grants


@pytest.mark.asyncio
async def test_streak_7_not_granted_for_six_days(
    service, achievements, sessions, clock
):
    days = [clock.current - timedelta(days=d) for d in range(6)]
    await _seed_completed_sessions(sessions, user_id="u1", started_ats=days)

    await service._on_session_completed(_event(user_id="u1"))

    assert ("u1", "streak_7") not in achievements.grants


# ── sprint_15 ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sprint_15_granted_at_fifteen_completed_today(
    service, achievements, sessions, clock
):
    today = clock.current.replace(hour=14)
    await _seed_completed_sessions(
        sessions,
        user_id="u1",
        started_ats=[today + timedelta(minutes=i) for i in range(15)],
    )

    await service._on_session_completed(_event(user_id="u1"))

    assert ("u1", "sprint_15") in achievements.grants


@pytest.mark.asyncio
async def test_sprint_15_not_granted_at_fourteen_completed(
    service, achievements, sessions, clock
):
    today = clock.current.replace(hour=14)
    await _seed_completed_sessions(
        sessions,
        user_id="u1",
        started_ats=[today + timedelta(minutes=i) for i in range(14)],
    )

    await service._on_session_completed(_event(user_id="u1"))

    assert ("u1", "sprint_15") not in achievements.grants


# ── night_owl ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_night_owl_granted_after_22h(service, achievements, clock):
    clock.current = clock.current.replace(hour=23)
    await service._on_session_completed(_event(user_id="u1"))
    assert ("u1", "night_owl") in achievements.grants


@pytest.mark.asyncio
async def test_night_owl_granted_before_6h(service, achievements, clock):
    clock.current = clock.current.replace(hour=4)
    await service._on_session_completed(_event(user_id="u1"))
    assert ("u1", "night_owl") in achievements.grants


@pytest.mark.asyncio
async def test_night_owl_not_granted_during_day(service, achievements, clock):
    clock.current = clock.current.replace(hour=12)
    await service._on_session_completed(_event(user_id="u1"))
    assert ("u1", "night_owl") not in achievements.grants


# ── idempotency ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_repeated_events_do_not_duplicate_grants(
    service, achievements, clock
):
    clock.current = clock.current.replace(hour=23)
    await service._on_session_completed(_event(user_id="u1"))
    await service._on_session_completed(_event(user_id="u1"))
    night_owl_count = sum(
        1 for (uid, code) in achievements.grants
        if uid == "u1" and code == "night_owl"
    )
    assert night_owl_count == 1


# ── event subscription wiring ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_service_subscribes_to_session_completed_on_construction(
    service, achievements, events, clock
):
    clock.current = clock.current.replace(hour=23)
    await events.publish(_event(user_id="u1"))
    assert ("u1", "night_owl") in achievements.grants
