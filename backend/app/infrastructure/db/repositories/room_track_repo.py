from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import IdempotencyViolationError
from app.domain.repositories.room_track_repo import (
    IRoomTrackRepo,
    RoomTrackRecord,
)
from app.infrastructure.db.models.room_track import RoomTrackORM


def _to_record(row: RoomTrackORM) -> RoomTrackRecord:
    return RoomTrackRecord(
        id=row.id,
        room_id=row.room_id,
        track_id=row.track_id,
        position=row.position,
    )


class SqlRoomTrackRepo(IRoomTrackRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_room(self, room_id: str) -> list[RoomTrackRecord]:
        stmt = (
            select(RoomTrackORM)
            .where(RoomTrackORM.room_id == room_id)
            .order_by(RoomTrackORM.position.asc(), RoomTrackORM.created_at.asc())
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_record(r) for r in rows]

    async def max_position(self, room_id: str) -> int | None:
        stmt = select(func.max(RoomTrackORM.position)).where(
            RoomTrackORM.room_id == room_id
        )
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def add(
        self,
        *,
        item_id: str,
        room_id: str,
        track_id: str,
        position: int,
    ) -> RoomTrackRecord:
        row = RoomTrackORM(
            id=item_id,
            room_id=room_id,
            track_id=track_id,
            position=position,
        )
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as e:
            await self._s.rollback()
            raise IdempotencyViolationError("room_track_already_exists") from e
        return _to_record(row)

    async def remove(self, *, room_id: str, track_id: str) -> bool:
        stmt = delete(RoomTrackORM).where(
            RoomTrackORM.room_id == room_id,
            RoomTrackORM.track_id == track_id,
        )
        result = await self._s.execute(stmt)
        return (result.rowcount or 0) > 0
