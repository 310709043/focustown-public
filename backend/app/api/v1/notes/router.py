from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.v1.notes.schemas import NoteCreate, NoteResponse, NoteUpdate
from app.core.deps import CurrentUserId, DbDep, IdGenDep
from app.domain.repositories.note_repo import NoteRecord
from app.domain.services.note_service import NoteService
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


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    match_id: str | None = Query(None, max_length=36),
) -> list[NoteResponse]:
    """Owner's notes. If ``match_id`` is given and the user is a
    member of that match, also include notes shared into the match."""
    svc = _service(db, ids)
    return [_dto(n) for n in await svc.list_for_user(user_id=user_id, match_id=match_id)]


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
