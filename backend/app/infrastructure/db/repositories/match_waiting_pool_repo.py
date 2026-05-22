from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.match_waiting_pool_repo import (
    IMatchWaitingPoolRepo,
    WaitingPoolRecord,
    WaitingPoolStatus,
)
from app.infrastructure.db.models.match_waiting_pool import MatchWaitingPoolORM


def _to_domain(row: MatchWaitingPoolORM) -> WaitingPoolRecord:
    return WaitingPoolRecord(
        user_id=row.user_id,
        status=row.status,  # type: ignore[arg-type]
        enqueued_at_ms=row.enqueued_at_ms,
        fallback_deadline_ms=row.fallback_deadline_ms,
        match_id=row.match_id,
    )


class SqlMatchWaitingPoolRepo(IMatchWaitingPoolRepo):
    """Postgres adapter for ``IMatchWaitingPoolRepo``.

    Upsert keyed on ``user_id`` (PK) so re-enqueue after cancel updates
    the same row in place. Status transitions go through narrow
    single-column UPDATEs that also stamp ``updated_at`` via
    ``func.now()`` — the ORM ``onupdate`` only fires through the ORM
    UnitOfWork path, not the Core ``update()`` we use here for atomic
    multi-row writes.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def upsert_waiting(
        self,
        user_id: str,
        *,
        enqueued_at_ms: int,
        fallback_deadline_ms: int,
    ) -> None:
        stmt = (
            pg_insert(MatchWaitingPoolORM)
            .values(
                user_id=user_id,
                status="waiting",
                enqueued_at_ms=enqueued_at_ms,
                fallback_deadline_ms=fallback_deadline_ms,
                match_id=None,
            )
            .on_conflict_do_update(
                index_elements=["user_id"],
                set_=dict(
                    status="waiting",
                    enqueued_at_ms=enqueued_at_ms,
                    fallback_deadline_ms=fallback_deadline_ms,
                    match_id=None,
                    updated_at=func.now(),
                ),
            )
        )
        await self._s.execute(stmt)

    async def _mark_status(
        self, user_id: str, *, status: WaitingPoolStatus
    ) -> None:
        stmt = (
            update(MatchWaitingPoolORM)
            .where(MatchWaitingPoolORM.user_id == user_id)
            .values(status=status, updated_at=func.now())
        )
        await self._s.execute(stmt)

    async def mark_paired(self, user_id: str, *, match_id: str) -> None:
        stmt = (
            update(MatchWaitingPoolORM)
            .where(MatchWaitingPoolORM.user_id == user_id)
            .values(status="paired", match_id=match_id, updated_at=func.now())
        )
        await self._s.execute(stmt)

    async def mark_pair_paired(
        self, user_a: str, user_b: str, *, match_id: str
    ) -> None:
        stmt = (
            update(MatchWaitingPoolORM)
            .where(MatchWaitingPoolORM.user_id.in_((user_a, user_b)))
            .values(status="paired", match_id=match_id, updated_at=func.now())
        )
        await self._s.execute(stmt)

    async def mark_cancelled(self, user_id: str) -> None:
        await self._mark_status(user_id, status="cancelled")

    async def mark_bot_fallback(self, user_id: str) -> None:
        await self._mark_status(user_id, status="bot_fallback")

    async def list_waiting(self) -> list[WaitingPoolRecord]:
        stmt = (
            select(MatchWaitingPoolORM)
            .where(MatchWaitingPoolORM.status == "waiting")
            .order_by(MatchWaitingPoolORM.enqueued_at_ms.asc())
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def get(self, user_id: str) -> WaitingPoolRecord | None:
        stmt = select(MatchWaitingPoolORM).where(
            MatchWaitingPoolORM.user_id == user_id
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None
