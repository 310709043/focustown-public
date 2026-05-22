from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import apply_keyset
from app.domain.repositories.match_realtime_repo import (
    IMatchAgendaRepo,
    IMatchMessageRepo,
    MatchAgendaItem,
    MatchMessage,
)
from app.infrastructure.db.models.match_realtime import (
    MatchAgendaItemORM,
    MatchMessageORM,
)


def _msg_to_domain(row: MatchMessageORM) -> MatchMessage:
    return MatchMessage(
        id=row.id,
        match_id=row.match_id,
        sender_id=row.sender_id,
        kind=row.kind,
        body=row.body,
        metadata=row.meta,
        created_at=row.created_at,
    )


def _ag_to_domain(row: MatchAgendaItemORM) -> MatchAgendaItem:
    return MatchAgendaItem(
        id=row.id,
        match_id=row.match_id,
        position=row.position,
        body=row.body,
        status=row.status,
        created_by=row.created_by,
        checked_by=row.checked_by,
        checked_at=row.checked_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlMatchMessageRepo(IMatchMessageRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_match(
        self,
        match_id: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[MatchMessage]:
        stmt = select(MatchMessageORM).where(MatchMessageORM.match_id == match_id)
        stmt = apply_keyset(
            stmt,
            ts_col=MatchMessageORM.created_at,
            id_col=MatchMessageORM.id,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            MatchMessageORM.created_at.desc(), MatchMessageORM.id.desc()
        ).limit(limit + 1)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_msg_to_domain(r) for r in rows]

    async def create(
        self,
        *,
        message_id: str,
        match_id: str,
        sender_id: str,
        kind: str,
        body: str,
        metadata: dict[str, Any] | None,
    ) -> MatchMessage:
        row = MatchMessageORM(
            id=message_id,
            match_id=match_id,
            sender_id=sender_id,
            kind=kind,
            body=body,
            meta=metadata,
        )
        self._s.add(row)
        await self._s.flush()
        return _msg_to_domain(row)


class SqlMatchAgendaRepo(IMatchAgendaRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_match(self, match_id: str) -> list[MatchAgendaItem]:
        stmt = (
            select(MatchAgendaItemORM)
            .where(MatchAgendaItemORM.match_id == match_id)
            .order_by(MatchAgendaItemORM.position.asc())
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_ag_to_domain(r) for r in rows]

    async def get(self, item_id: str) -> MatchAgendaItem | None:
        row = await self._s.get(MatchAgendaItemORM, item_id)
        return _ag_to_domain(row) if row else None

    async def create(
        self,
        *,
        item_id: str,
        match_id: str,
        position: int,
        body: str,
        created_by: str,
    ) -> MatchAgendaItem:
        row = MatchAgendaItemORM(
            id=item_id,
            match_id=match_id,
            position=position,
            body=body,
            created_by=created_by,
        )
        self._s.add(row)
        await self._s.flush()
        return _ag_to_domain(row)

    async def update(
        self,
        item_id: str,
        *,
        body: str | None = None,
        status: str | None = None,
        position: int | None = None,
        checked_by: str | None = None,
        checked_at: datetime | None = None,
    ) -> MatchAgendaItem | None:
        values: dict[str, Any] = {}
        if body is not None:
            values["body"] = body
        if status is not None:
            values["status"] = status
        if position is not None:
            values["position"] = position
        if checked_by is not None or status == "done":
            values["checked_by"] = checked_by
        if checked_at is not None or status == "done":
            values["checked_at"] = checked_at
        if values:
            await self._s.execute(
                update(MatchAgendaItemORM)
                .where(MatchAgendaItemORM.id == item_id)
                .values(**values)
            )
            await self._s.flush()
        row = await self._s.get(MatchAgendaItemORM, item_id)
        return _ag_to_domain(row) if row else None

    async def delete(self, item_id: str) -> None:
        await self._s.execute(
            delete(MatchAgendaItemORM).where(MatchAgendaItemORM.id == item_id)
        )
        await self._s.flush()

    async def next_position(self, match_id: str) -> int:
        stmt = select(func.coalesce(func.max(MatchAgendaItemORM.position), -1)).where(
            MatchAgendaItemORM.match_id == match_id
        )
        max_pos = (await self._s.execute(stmt)).scalar_one()
        return int(max_pos) + 1
