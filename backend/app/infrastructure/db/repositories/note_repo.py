from __future__ import annotations

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.sentinels import UNSET, UnsetType
from app.domain.repositories.note_repo import INoteRepo, NoteRecord
from app.infrastructure.db.models.note import NoteORM


def _to_record(row: NoteORM) -> NoteRecord:
    return NoteRecord(
        id=row.id,
        user_id=row.user_id,
        title=row.title,
        body=row.body,
        done=row.done,
        created_at=row.created_at,
        updated_at=row.updated_at,
        shared_in_match_id=row.shared_in_match_id,
    )


class SqlNoteRepo(INoteRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_for_user(
        self,
        user_id: str,
        *,
        include_shared_in_match_id: str | None = None,
    ) -> list[NoteRecord]:
        if include_shared_in_match_id is None:
            stmt = (
                select(NoteORM)
                .where(NoteORM.user_id == user_id)
                .order_by(NoteORM.created_at.desc())
            )
        else:
            # Own notes + any note shared into this match (including
            # the partner's notes). De-dup on id implicit since each
            # row participates in exactly one branch.
            stmt = (
                select(NoteORM)
                .where(
                    or_(
                        NoteORM.user_id == user_id,
                        NoteORM.shared_in_match_id == include_shared_in_match_id,
                    )
                )
                .order_by(NoteORM.created_at.desc())
            )
        return [_to_record(r) for r in (await self._s.execute(stmt)).scalars().all()]

    async def get(self, note_id: str) -> NoteRecord | None:
        row = await self._s.get(NoteORM, note_id)
        return _to_record(row) if row else None

    async def create(
        self,
        *,
        note_id: str,
        user_id: str,
        title: str,
        body: str,
        shared_in_match_id: str | None = None,
    ) -> NoteRecord:
        row = NoteORM(
            id=note_id,
            user_id=user_id,
            title=title,
            body=body,
            done=False,
            shared_in_match_id=shared_in_match_id,
        )
        self._s.add(row)
        await self._s.flush()
        return _to_record(row)

    async def update(
        self,
        *,
        note_id: str,
        user_id: str,
        title: str | None = None,
        body: str | None = None,
        done: bool | None = None,
        shared_in_match_id: str | None | UnsetType = UNSET,
    ) -> NoteRecord:
        row = await self._s.get(NoteORM, note_id)
        if row is None or row.user_id != user_id:
            raise NotFoundError("note_not_found")
        if title is not None:
            row.title = title
        if body is not None:
            row.body = body
        if done is not None:
            row.done = done
        if not isinstance(shared_in_match_id, UnsetType):
            row.shared_in_match_id = shared_in_match_id
        await self._s.flush()
        return _to_record(row)

    async def delete(self, *, note_id: str, user_id: str) -> None:
        stmt = delete(NoteORM).where(NoteORM.id == note_id, NoteORM.user_id == user_id)
        result = await self._s.execute(stmt)
        if result.rowcount == 0:
            raise NotFoundError("note_not_found")
