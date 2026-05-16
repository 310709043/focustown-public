from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.sessions.schemas import FocusSessionResponse, StartSessionRequest
from app.core.deps import ClockDep, CurrentUserId, DbDep, EventBusDep, IdGenDep
from app.domain.models import FocusSession
from app.domain.services.focus_session_service import FocusSessionService
from app.infrastructure.db.repositories import SqlFocusSessionRepo

router = APIRouter()


def _dto(s: FocusSession) -> FocusSessionResponse:
    return FocusSessionResponse(
        id=s.id,
        user_id=s.user_id,
        partner_user_id=s.partner_user_id,
        mode=s.mode,
        duration_seconds=s.duration_seconds,
        elapsed_seconds=s.elapsed_seconds,
        remaining_seconds=s.remaining_seconds,
        status=s.status,
        task_label=s.task_label,
        started_at=s.started_at,
        ended_at=s.ended_at,
    )


def _service(db, clock, ids, events) -> FocusSessionService:
    return FocusSessionService(
        repo=SqlFocusSessionRepo(db),
        clock=clock,
        ids=ids,
        events=events,
    )


@router.post("", response_model=FocusSessionResponse, status_code=201)
async def start_session(
    payload: StartSessionRequest,
    user_id: CurrentUserId,
    db: DbDep,
    clock: ClockDep,
    ids: IdGenDep,
    events: EventBusDep,
) -> FocusSessionResponse:
    svc = _service(db, clock, ids, events)
    session = await svc.start(
        user_id=user_id,
        mode=payload.mode,
        duration_seconds=payload.duration_seconds,
        task_label=payload.task_label,
        partner_user_id=payload.partner_user_id,
    )
    return _dto(session)


@router.post("/{session_id}/complete", response_model=FocusSessionResponse)
async def complete_session(
    session_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    clock: ClockDep,
    ids: IdGenDep,
    events: EventBusDep,
) -> FocusSessionResponse:
    svc = _service(db, clock, ids, events)
    return _dto(await svc.complete(session_id=session_id, user_id=user_id))


@router.post("/{session_id}/cancel", response_model=FocusSessionResponse)
async def cancel_session(
    session_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    clock: ClockDep,
    ids: IdGenDep,
    events: EventBusDep,
) -> FocusSessionResponse:
    svc = _service(db, clock, ids, events)
    return _dto(await svc.cancel(session_id=session_id, user_id=user_id))


@router.get("/{session_id}", response_model=FocusSessionResponse)
async def get_session(
    session_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    clock: ClockDep,
    ids: IdGenDep,
    events: EventBusDep,
) -> FocusSessionResponse:
    svc = _service(db, clock, ids, events)
    session = await svc.get_owned(session_id=session_id, user_id=user_id)
    return _dto(session)
