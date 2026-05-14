from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessError, NotFoundError
from app.core.sentinels import UnsetType
from app.domain.models.room_item import RoomItem
from app.domain.repositories.room_item_repo import IRoomItemRepo
from app.infrastructure.db.models.room_item import RoomItemORM


def _to_domain(row: RoomItemORM) -> RoomItem:
    return RoomItem(
        id=row.id,
        room_id=row.room_id,
        user_item_id=row.user_item_id,
        x=row.x,
        y=row.y,
        z_index=row.z_index,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlRoomItemRepo(IRoomItemRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_for_room(self, room_id: str) -> list[RoomItem]:
        stmt = (
            select(RoomItemORM)
            .where(RoomItemORM.room_id == room_id)
            .order_by(RoomItemORM.z_index.asc(), RoomItemORM.created_at.asc())
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def get(self, item_id: str) -> RoomItem | None:
        row = await self._s.get(RoomItemORM, item_id)
        return _to_domain(row) if row else None

    async def create(
        self,
        *,
        item_id: str,
        room_id: str,
        user_item_id: str,
        x: int,
        y: int,
        z_index: int,
    ) -> RoomItem:
        row = RoomItemORM(
            id=item_id,
            room_id=room_id,
            user_item_id=user_item_id,
            x=x,
            y=y,
            z_index=z_index,
        )
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as exc:
            # Either the room_id or user_item_id FK doesn't exist; both
            # cases are caller bugs (the service should have validated
            # them up-front), but lift to a domain error so the router
            # can translate to a 400.
            await self._s.rollback()
            raise BusinessError("room_item_invalid_ref") from exc
        await self._s.refresh(row, ["updated_at"])
        return _to_domain(row)

    async def update_position(
        self,
        *,
        item_id: str,
        x: int,
        y: int,
        z_index: int | UnsetType,
    ) -> RoomItem:
        row = await self._s.get(RoomItemORM, item_id)
        if row is None:
            raise NotFoundError("room_item_not_found")
        row.x = x
        row.y = y
        if isinstance(z_index, int):
            row.z_index = z_index
        await self._s.flush()
        await self._s.refresh(row, ["updated_at"])
        return _to_domain(row)

    async def delete(self, item_id: str) -> None:
        # Idempotent: silently no-op if the row is already gone, so the
        # service can stay simple. The router maps a separate "not found
        # before delete" condition via ``get`` if it cares.
        await self._s.execute(
            delete(RoomItemORM).where(RoomItemORM.id == item_id)
        )
