from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.notes.schemas import NoteCreate, NoteResponse, NoteUpdate
from app.core.deps import CurrentUserId, DbDep, IdGenDep
from app.domain.repositories.note_repo import NoteRecord
from app.infrastructure.db.repositories import SqlNoteRepo

router = APIRouter()


def _dto(n: NoteRecord) -> NoteResponse:
    return NoteResponse(
        id=n.id,
        title=n.title,
        body=n.body,
        done=n.done,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


@router.get("", response_model=list[NoteResponse])
async def list_notes(user_id: CurrentUserId, db: DbDep) -> list[NoteResponse]:
    repo = SqlNoteRepo(db)
    return [_dto(n) for n in await repo.list_for_user(user_id)]


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    payload: NoteCreate,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
) -> NoteResponse:
    repo = SqlNoteRepo(db)
    note = await repo.create(
        note_id=ids.new_id(), user_id=user_id, title=payload.title, body=payload.body
    )
    return _dto(note)


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    user_id: CurrentUserId,
    db: DbDep,
) -> NoteResponse:
    repo = SqlNoteRepo(db)
    note = await repo.update(
        note_id=note_id,
        user_id=user_id,
        title=payload.title,
        body=payload.body,
        done=payload.done,
    )
    return _dto(note)


@router.delete("/{note_id}", status_code=204)
async def delete_note(note_id: str, user_id: CurrentUserId, db: DbDep) -> None:
    repo = SqlNoteRepo(db)
    await repo.delete(note_id=note_id, user_id=user_id)
