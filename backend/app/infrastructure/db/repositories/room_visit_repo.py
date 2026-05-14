from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.domain.models.room_visit import RoomVisit
from app.domain.repositories.room_visit_repo import IRoomVisitRepo
from app.infrastructure.db.models.room_visit import RoomVisitORM


def _to_domain(row: RoomVisitORM) -> RoomVisit:
    return RoomVisit(
        id=row.id,
        room_id=row.room_id,
        visitor_user_id=row.visitor_user_id,
        joined_at=row.joined_at,
    )


class SqlRoomVisitRepo(IRoomVisitRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_room(self, room_id: str) -> list[RoomVisit]:
        stmt = (
            select(RoomVisitORM)
            .where(RoomVisitORM.room_id == room_id)
            .order_by(RoomVisitORM.joined_at.asc())
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def get_by_user(self, visitor_user_id: str) -> RoomVisit | None:
        stmt = select(RoomVisitORM).where(
            RoomVisitORM.visitor_user_id == visitor_user_id
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def count_by_room(self, room_id: str) -> int:
        stmt = select(func.count(RoomVisitORM.id)).where(
            RoomVisitORM.room_id == room_id
        )
        return int((await self._s.execute(stmt)).scalar_one())

    async def create(
        self,
        *,
        visit_id: str,
        room_id: str,
        visitor_user_id: str,
    ) -> RoomVisit:
        row = RoomVisitORM(
            id=visit_id,
            room_id=room_id,
            visitor_user_id=visitor_user_id,
        )
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as exc:
            # UNIQUE(visitor_user_id) tripped — the visitor is already in
            # a (possibly different) room. The service translates this
            # into auto-leave + retry rather than surfacing 409 to the
            # caller.
            await self._s.rollback()
            raise ConflictError("already_visiting") from exc
        # Refresh server-default timestamps so the returned record
        # carries the canonical values.
        await self._s.refresh(row, ["joined_at", "updated_at"])
        return _to_domain(row)

    async def delete(self, visit_id: str) -> None:
        await self._s.execute(
            delete(RoomVisitORM).where(RoomVisitORM.id == visit_id)
        )
