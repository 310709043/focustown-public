from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.sentinels import UnsetType
from app.domain.models.room import Room, RoomVisibility
from app.domain.repositories.room_repo import IRoomRepo, RoomAlreadyExistsError
from app.infrastructure.db.models.room import RoomORM


def _to_domain(row: RoomORM) -> Room:
    # ``visibility`` is a free-form VARCHAR at the DB level but constrained
    # to the two-value enum by the CHECK constraint; cast is safe.
    return Room(
        id=row.id,
        owner_user_id=row.owner_user_id,
        name=row.name,
        theme=row.theme,
        visibility=row.visibility,  # type: ignore[arg-type]
        max_visitors=row.max_visitors,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlRoomRepo(IRoomRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_by_owner(self, owner_user_id: str) -> Room | None:
        stmt = select(RoomORM).where(RoomORM.owner_user_id == owner_user_id)
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def get_by_id(self, room_id: str) -> Room | None:
        row = await self._s.get(RoomORM, room_id)
        return _to_domain(row) if row else None

    async def create(
        self,
        *,
        room_id: str,
        owner_user_id: str,
        name: str,
        theme: str,
        visibility: RoomVisibility = "public",
        max_visitors: int = 5,
    ) -> Room:
        row = RoomORM(
            id=room_id,
            owner_user_id=owner_user_id,
            name=name,
            theme=theme,
            visibility=visibility,
            max_visitors=max_visitors,
        )
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as e:
            # UNIQUE(owner_user_id) — translate to the domain-level
            # error so the service layer can re-read without coupling
            # to sqlalchemy exception types.
            await self._s.rollback()
            raise RoomAlreadyExistsError from e
        await self._s.refresh(row, ["updated_at"])
        return _to_domain(row)

    async def update(
        self,
        *,
        room_id: str,
        name: str | UnsetType,
        theme: str | UnsetType,
    ) -> Room:
        row = await self._s.get(RoomORM, room_id)
        if row is None:
            raise NotFoundError("room_not_found")
        if isinstance(name, str):
            row.name = name
        if isinstance(theme, str):
            row.theme = theme
        await self._s.flush()
        # Server-side ``onupdate=func.now()`` makes updated_at expired
        # after flush — explicit refresh avoids a MissingGreenlet when
        # _to_domain reads it.
        await self._s.refresh(row, ["updated_at"])
        return _to_domain(row)
