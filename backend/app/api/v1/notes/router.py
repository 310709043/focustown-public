from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.v1._common.pagination import Page, build_page
from app.api.v1._common.streaming import ndjson_response, stream_orm
from app.api.v1.notes.schemas import NoteCreate, NoteResponse, NoteUpdate
from app.core.deps import CurrentUserId, DbDep, IdGenDep
from app.domain.repositories.note_repo import NoteRecord
from app.domain.services.note_service import NoteService
from app.infrastructure.db.models.note import NoteORM
from app.infrastructure.db.repositories import SqlMatchRepo, SqlNoteRepo

router = APIRouter()


def _service(db, ids) -> NoteService:  # type: ignore[no-untyped-def]
    return NoteService(
        notes=SqlNoteRepo(db),
        matches=SqlMatchRepo(db),
        ids=ids,
    )


def _dto(n: NoteRecord) -> NoteResponse:
    return NoteResponse(
        id=n.id,
        user_id=n.user_id,
        title=n.title,
        body=n.body,
        done=n.done,
        created_at=n.created_at,
        updated_at=n.updated_at,
        shared_in_match_id=n.shared_in_match_id,
    )


@router.get("", response_model=Page[NoteResponse])
async def list_notes(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    match_id: str | None = Query(None, max_length=36),
    shared_only: bool = Query(False),
    cursor: str | None = Query(None, max_length=256),
    limit: int = Query(50, ge=1, le=100),
) -> Page[NoteResponse]:
    """Owner's notes. If ``match_id`` is given and the user is a
    member of that match, also include notes shared into the match.
    If ``shared_only`` is true, return only the shared notes
    (not the caller's own notes)."""
    svc = _service(db, ids)
    rows = await svc.list_for_user(
        user_id=user_id, match_id=match_id, shared_only=shared_only,
        cursor=cursor, limit=limit,
    )
    return build_page(
        rows,
        limit=limit,
        key=lambda n: (n.created_at, n.id),
        to_item=_dto,
    )


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    payload: NoteCreate,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
) -> NoteResponse:
    svc = _service(db, ids)
    note = await svc.create(
        user_id=user_id,
        title=payload.title,
        body=payload.body,
        shared_in_match_id=payload.shared_in_match_id,
    )
    return _dto(note)


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
) -> NoteResponse:
    svc = _service(db, ids)
    note = await svc.update(
        user_id=user_id,
        note_id=note_id,
        title=payload.title,
        body=payload.body,
        done=payload.done,
        shared_in_match_id=payload.shared_in_match_id,
    )
    return _dto(note)


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: str, user_id: CurrentUserId, db: DbDep, ids: IdGenDep
) -> None:
    svc = _service(db, ids)
    await svc.delete(user_id=user_id, note_id=note_id)


@router.get("/export")
async def export_notes(
    user_id: CurrentUserId,
    db: DbDep,
) -> StreamingResponse:
    """Stream the caller's notes as NDJSON. Excludes notes shared into a
    match unless they were authored by the caller — exports are for the
    user's own backup, not a snapshot of the partnered notepad.
    """
    stmt = (
        select(NoteORM)
        .where(NoteORM.user_id == user_id)
        .order_by(NoteORM.created_at.desc(), NoteORM.id.desc())
    )

    def _to_dict(row: NoteORM) -> dict:
        return {
            "id": row.id,
            "user_id": row.user_id,
            "title": row.title,
            "body": row.body,
            "done": row.done,
            "shared_in_match_id": row.shared_in_match_id,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    return ndjson_response(stream_orm(db, stmt, to_dict=_to_dict))
