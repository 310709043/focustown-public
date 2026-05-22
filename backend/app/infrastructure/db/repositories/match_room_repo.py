from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domain.repositories.match_room_repo import (
    IMatchRoomRepo,
    MatchRoomRecord,
    MatchRoomStatus,
)
from app.infrastructure.db.models.match_room import MatchRoomORM


def _to_domain(row: MatchRoomORM) -> MatchRoomRecord:
    return MatchRoomRecord(
        id=row.id,
        match_id=row.match_id,
        status=row.status,  # type: ignore[arg-type]
        opened_at=row.opened_at,
        activated_at=row.activated_at,
        ended_at=row.ended_at,
        ended_reason=row.ended_reason,
    )


class SqlMatchRoomRepo(IMatchRoomRepo):
    """Postgres adapter for ``IMatchRoomRepo``.

    ``create_if_absent`` is the idempotency seam: ``pg_insert(...)
    .on_conflict_do_nothing(index_elements=['match_id'])`` collapses
    two concurrent accepts into a single committed row. The follow-up
    SELECT round-trip returns the canonical row regardless of which
    caller actually inserted it.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create_if_absent(
        self, *, room_id: str, match_id: str
    ) -> MatchRoomRecord:
        stmt = (
            pg_insert(MatchRoomORM)
            .values(id=room_id, match_id=match_id, status="open")
            .on_conflict_do_nothing(index_elements=["match_id"])
        )
        await self._s.execute(stmt)
        # Always re-read by match_id — handles both the "we just inserted"
        # case and the "another caller raced in and our INSERT was a
        # no-op" case with the same code path.
        existing = await self.get_by_match_id(match_id)
        if existing is None:  # pragma: no cover — defensive
            raise NotFoundError("match_room_lookup_failed_after_insert")
        return existing

    async def get(self, room_id: str) -> MatchRoomRecord | None:
        row = await self._s.get(MatchRoomORM, room_id)
        return _to_domain(row) if row else None

    async def get_by_match_id(self, match_id: str) -> MatchRoomRecord | None:
        stmt = select(MatchRoomORM).where(MatchRoomORM.match_id == match_id)
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def set_status(
        self,
        *,
        room_id: str,
        status: MatchRoomStatus,
        activated_at: datetime | None = None,
        ended_at: datetime | None = None,
        ended_reason: str | None = None,
    ) -> MatchRoomRecord:
        values: dict[str, object] = {
            "status": status,
            "updated_at": func.now(),
        }
        if activated_at is not None:
            values["activated_at"] = activated_at
        if ended_at is not None:
            values["ended_at"] = ended_at
        if ended_reason is not None:
            values["ended_reason"] = ended_reason
        stmt = (
            update(MatchRoomORM)
            .where(MatchRoomORM.id == room_id)
            .values(**values)
            .returning(MatchRoomORM)
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFoundError("match_room_not_found")
        return _to_domain(row)

    async def list_by_status(
        self, status: MatchRoomStatus
    ) -> list[MatchRoomRecord]:
        stmt = select(MatchRoomORM).where(MatchRoomORM.status == status)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_open_older_than(
        self, cutoff: datetime
    ) -> list[MatchRoomRecord]:
        stmt = select(MatchRoomORM).where(
            MatchRoomORM.status == "open", MatchRoomORM.opened_at < cutoff
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]
