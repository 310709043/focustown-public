"""FocusSessionService unit tests.

What's worth testing here, per the plan:
- ``start`` emits SessionStarted and persists with default duration when none given
- ``complete`` clamps ``elapsed_seconds`` to ``duration_seconds`` and emits SessionCompleted
- ``complete`` / ``cancel`` reject non-active sessions
- ``sweep_abandoned`` applies the 60-second grace exactly
- ``get_owned`` rejects non-members

What's NOT worth testing here:
- Trivial constructor wiring
- Pure pass-through ``get`` (covered indirectly by ``complete``)
"""
from __future__ import annotations

from datetime import timedelta

import pytest

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.domain.events import SessionAbandoned, SessionCompleted, SessionStarted
from app.domain.models import FocusSessionMode, FocusSessionStatus
from app.domain.services.focus_session_service import FocusSessionService
from tests.unit.fakes import FakeFocusSessionRepo


@pytest.fixture
def repo() -> FakeFocusSessionRepo:
    return FakeFocusSessionRepo()


@pytest.fixture
def service(repo, clock, ids, events) -> FocusSessionService:
    return FocusSessionService(repo=repo, clock=clock, ids=ids, events=events)


@pytest.fixture
def collected_events(events) -> list:
    captured: list = []

    async def record(event):
        captured.append(event)

    events.subscribe(SessionStarted, record)
    events.subscribe(SessionCompleted, record)
    events.subscribe(SessionAbandoned, record)
    return captured


# ── start ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_uses_default_duration_when_none_given(service, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=None,
        task_label=None,
        partner_user_id=None,
    )
    assert session.duration_seconds == 25 * 60


@pytest.mark.asyncio
async def test_start_honors_explicit_duration(service):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.SHORT_BREAK,
        duration_seconds=10,
        task_label="warmup",
        partner_user_id=None,
    )
    assert session.duration_seconds == 10


@pytest.mark.asyncio
async def test_start_publishes_session_started(service, collected_events, clock):
    await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=None,
        task_label=None,
        partner_user_id="u2",
    )
    assert collected_events == [
        SessionStarted(
            session_id="id-1",
            user_id="u1",
            partner_user_id="u2",
            started_at=clock.current,
        )
    ]


@pytest.mark.asyncio
async def test_start_persists_to_repo(service, repo):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=None,
        task_label=None,
        partner_user_id=None,
    )
    assert repo.rows[session.id].status is FocusSessionStatus.ACTIVE


# ── complete ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_complete_clamps_elapsed_to_duration(service, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    clock.advance(timedelta(seconds=900))  # overran by 5 minutes
    completed = await service.complete(session_id=session.id, user_id="u1")
    assert completed.elapsed_seconds == 600


@pytest.mark.asyncio
async def test_complete_sets_status_completed(service, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    clock.advance(timedelta(seconds=600))
    completed = await service.complete(session_id=session.id, user_id="u1")
    assert completed.status is FocusSessionStatus.COMPLETED


@pytest.mark.asyncio
async def test_complete_publishes_session_completed(
    service, collected_events, clock
):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id="u2",
    )
    clock.advance(timedelta(seconds=600))
    await service.complete(session_id=session.id, user_id="u1")
    completed_events = [e for e in collected_events if isinstance(e, SessionCompleted)]
    assert completed_events == [
        SessionCompleted(
            session_id=session.id,
            user_id="u1",
            partner_user_id="u2",
            duration_seconds=600,
            ended_at=clock.current,
        )
    ]


@pytest.mark.asyncio
async def test_complete_rejects_non_active_session(service, repo, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    await service.complete(session_id=session.id, user_id="u1")
    with pytest.raises(ConflictError):
        await service.complete(session_id=session.id, user_id="u1")


# ── cancel ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cancel_sets_status_cancelled(service, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    clock.advance(timedelta(seconds=30))
    cancelled = await service.cancel(session_id=session.id, user_id="u1")
    assert cancelled.status is FocusSessionStatus.CANCELLED


@pytest.mark.asyncio
async def test_cancel_rejects_completed_session(service, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    clock.advance(timedelta(seconds=600))
    await service.complete(session_id=session.id, user_id="u1")
    with pytest.raises(ConflictError):
        await service.cancel(session_id=session.id, user_id="u1")


# ── get_owned (member check) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_complete_forbidden_for_non_member(service):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id="u2",
    )
    with pytest.raises(ForbiddenError):
        await service.complete(session_id=session.id, user_id="u-stranger")


@pytest.mark.asyncio
async def test_partner_can_complete_session(service, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id="u2",
    )
    clock.advance(timedelta(seconds=600))
    completed = await service.complete(session_id=session.id, user_id="u2")
    assert completed.status is FocusSessionStatus.COMPLETED


@pytest.mark.asyncio
async def test_complete_unknown_session_raises_not_found(service):
    with pytest.raises(NotFoundError):
        await service.complete(session_id="does-not-exist", user_id="u1")


# ── sweep_abandoned ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sweep_does_not_mark_session_inside_grace(service, clock):
    session = await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    # 600s duration + 59s into grace window -> not yet abandoned
    clock.advance(timedelta(seconds=659))
    swept = await service.sweep_abandoned()
    assert swept == []
    assert (await service._repo.get(session.id)).status is FocusSessionStatus.ACTIVE


@pytest.mark.asyncio
async def test_sweep_marks_session_at_grace_boundary(service, clock):
    await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    clock.advance(timedelta(seconds=660))  # exactly at duration + 60s grace
    swept = await service.sweep_abandoned()
    assert len(swept) == 1
    assert swept[0].status is FocusSessionStatus.ABANDONED


@pytest.mark.asyncio
async def test_sweep_publishes_session_abandoned(service, collected_events, clock):
    await service.start(
        user_id="u1",
        mode=FocusSessionMode.FOCUS,
        duration_seconds=600,
        task_label=None,
        partner_user_id=None,
    )
    clock.advance(timedelta(seconds=660))
    await service.sweep_abandoned()
    abandoned = [e for e in collected_events if isinstance(e, SessionAbandoned)]
    assert len(abandoned) == 1
