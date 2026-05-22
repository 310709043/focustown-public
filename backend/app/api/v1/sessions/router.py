from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.v1._common.streaming import ndjson_response, stream_orm
from app.api.v1.sessions.schemas import FocusSessionResponse, StartSessionRequest
from app.core.deps import ClockDep, CurrentUserId, DbDep, EventBusDep, IdGenDep
from app.domain.models import FocusSession
from app.domain.services.focus_session_service import FocusSessionService
from app.infrastructure.db.models.focus_session import FocusSessionORM
from app.infrastructure.db.repositories import SqlFocusSessionRepo
from app.infrastructure.db.repositories.match_repo import SqlMatchRepo

router = APIRouter()


def _body_hash(payload: StartSessionRequest) -> str:
    # sha256(canonical JSON) so two requests with the same intent always
    # hash to the same value regardless of field ordering or default
    # population. ``mode="json"`` so enums serialise to their string value
    # (matching what the client sent on the wire).
    canonical = json.dumps(
        payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


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
        matches=SqlMatchRepo(db),
    )


@router.post("", response_model=FocusSessionResponse, status_code=201)
async def start_session(
    payload: StartSessionRequest,
    user_id: CurrentUserId,
    db: DbDep,
    clock: ClockDep,
    ids: IdGenDep,
    events: EventBusDep,
    idempotency_key: str | None = Header(
        default=None, alias="Idempotency-Key", max_length=128
    ),
) -> FocusSessionResponse:
    svc = _service(db, clock, ids, events)
    session = await svc.start(
        user_id=user_id,
        mode=payload.mode,
        duration_seconds=payload.duration_seconds,
        task_label=payload.task_label,
        partner_user_id=payload.partner_user_id,
        idempotency_key=idempotency_key,
        body_hash=_body_hash(payload) if idempotency_key else None,
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


@router.get("/export")
async def export_sessions(
    user_id: CurrentUserId,
    db: DbDep,
) -> StreamingResponse:
    """Stream the caller's full focus-session history as NDJSON.

    Uses ``stream_scalars`` + ``yield_per`` server-side so a long history
    doesn't materialize as a single buffered list in memory; smoke-test
    via ``curl --no-buffer`` to confirm row-by-row delivery.
    """
    stmt = (
        select(FocusSessionORM)
        .where(FocusSessionORM.user_id == user_id)
        .order_by(FocusSessionORM.started_at.desc(), FocusSessionORM.id.desc())
    )

    def _to_dict(row: FocusSessionORM) -> dict:
        return {
            "id": row.id,
            "user_id": row.user_id,
            "partner_user_id": row.partner_user_id,
            "mode": row.mode,
            "duration_seconds": row.duration_seconds,
            "elapsed_seconds": row.elapsed_seconds,
            "status": row.status,
            "task_label": row.task_label,
            "started_at": row.started_at,
            "ended_at": row.ended_at,
        }

    return ndjson_response(stream_orm(db, stmt, to_dict=_to_dict))


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
