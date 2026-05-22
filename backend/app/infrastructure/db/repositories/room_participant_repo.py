from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domain.repositories.room_participant_repo import (
    IRoomParticipantRepo,
    RoomParticipantRecord,
)
from app.infrastructure.db.models.room_participant import RoomParticipantORM


def _to_domain(row: RoomParticipantORM) -> RoomParticipantRecord:
    return RoomParticipantRecord(
        room_id=row.room_id,
        user_id=row.user_id,
        role=row.role,  # type: ignore[arg-type]
        joined_at=row.joined_at,
        left_at=row.left_at,
        focus_session_id=row.focus_session_id,
    )


class SqlRoomParticipantRepo(IRoomParticipantRepo):
    """Postgres adapter for ``IRoomParticipantRepo``.

    The ``upsert_pair`` bulk insert uses ``on_conflict_do_nothing`` on
    the composite primary key ``(room_id, user_id)`` so a concurrent
    accept that has already materialised the rows is a silent no-op.
    The follow-up SELECT returns the canonical pair regardless of which
    caller actually inserted them.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def upsert_pair(
        self,
        *,
        room_id: str,
        requester_id: str,
        candidate_id: str,
    ) -> list[RoomParticipantRecord]:
        stmt = (
            pg_insert(RoomParticipantORM)
            .values(
                [
                    {
                        "room_id": room_id,
                        "user_id": requester_id,
                        "role": "requester",
                    },
                    {
                        "room_id": room_id,
                        "user_id": candidate_id,
                        "role": "candidate",
                    },
                ]
            )
            .on_conflict_do_nothing(index_elements=["room_id", "user_id"])
        )
        await self._s.execute(stmt)
        rows = await self.list_by_room(room_id)
        # Sort requester first so callers (and the event payload) see a
        # deterministic order matching the original match's requester /
        # candidate orientation.
        rows.sort(key=lambda r: 0 if r.role == "requester" else 1)
        return rows

    async def list_by_room(self, room_id: str) -> list[RoomParticipantRecord]:
        stmt = select(RoomParticipantORM).where(
            RoomParticipantORM.room_id == room_id
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def get(
        self, *, room_id: str, user_id: str
    ) -> RoomParticipantRecord | None:
        stmt = select(RoomParticipantORM).where(
            RoomParticipantORM.room_id == room_id,
            RoomParticipantORM.user_id == user_id,
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def mark_joined(
        self, *, room_id: str, user_id: str, joined_at: datetime
    ) -> RoomParticipantRecord:
        stmt = (
            update(RoomParticipantORM)
            .where(
                RoomParticipantORM.room_id == room_id,
                RoomParticipantORM.user_id == user_id,
            )
            .values(joined_at=joined_at, updated_at=func.now())
            .returning(RoomParticipantORM)
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFoundError("room_participant_not_found")
        return _to_domain(row)

    async def mark_left(
        self, *, room_id: str, user_id: str, left_at: datetime
    ) -> RoomParticipantRecord:
        stmt = (
            update(RoomParticipantORM)
            .where(
                RoomParticipantORM.room_id == room_id,
                RoomParticipantORM.user_id == user_id,
            )
            .values(left_at=left_at, updated_at=func.now())
            .returning(RoomParticipantORM)
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFoundError("room_participant_not_found")
        return _to_domain(row)

    async def link_session(
        self, *, room_id: str, user_id: str, focus_session_id: str
    ) -> RoomParticipantRecord:
        stmt = (
            update(RoomParticipantORM)
            .where(
                RoomParticipantORM.room_id == room_id,
                RoomParticipantORM.user_id == user_id,
            )
            .values(focus_session_id=focus_session_id, updated_at=func.now())
            .returning(RoomParticipantORM)
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFoundError("room_participant_not_found")
        return _to_domain(row)
