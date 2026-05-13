from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.infrastructure.db.models.focus_session import FocusSessionORM


def _to_domain(row: FocusSessionORM) -> FocusSession:
    return FocusSession(
        id=row.id,
        user_id=row.user_id,
        partner_user_id=row.partner_user_id,
        mode=FocusSessionMode(row.mode),
        duration_seconds=row.duration_seconds,
        elapsed_seconds=row.elapsed_seconds,
        status=FocusSessionStatus(row.status),
        task_label=row.task_label,
        started_at=row.started_at,
        ended_at=row.ended_at,
    )


class SqlFocusSessionRepo(IFocusSessionRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(
        self,
        *,
        session_id: str,
        user_id: str,
        mode: FocusSessionMode,
        duration_seconds: int,
        task_label: str | None,
        partner_user_id: str | None,
        started_at: datetime,
    ) -> FocusSession:
        row = FocusSessionORM(
            id=session_id,
            user_id=user_id,
            partner_user_id=partner_user_id,
            mode=mode.value,
            duration_seconds=duration_seconds,
            elapsed_seconds=0,
            status=FocusSessionStatus.ACTIVE.value,
            task_label=task_label,
            started_at=started_at,
        )
        self._s.add(row)
        await self._s.flush()
        return _to_domain(row)

    async def get(self, session_id: str) -> FocusSession | None:
        row = await self._s.get(FocusSessionORM, session_id)
        return _to_domain(row) if row else None

    async def update_status(
        self,
        *,
        session_id: str,
        status: FocusSessionStatus,
        elapsed_seconds: int,
        ended_at: datetime | None,
    ) -> FocusSession:
        row = await self._s.get(FocusSessionORM, session_id)
        if row is None:
            raise NotFoundError("focus_session_not_found")
        row.status = status.value
        row.elapsed_seconds = elapsed_seconds
        row.ended_at = ended_at
        await self._s.flush()
        return _to_domain(row)

    async def list_active(self) -> list[FocusSession]:
        stmt = select(FocusSessionORM).where(
            FocusSessionORM.status == FocusSessionStatus.ACTIVE.value
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_by_user_since(
        self, *, user_id: str, since: datetime
    ) -> list[FocusSession]:
        stmt = (
            select(FocusSessionORM)
            .where(FocusSessionORM.user_id == user_id, FocusSessionORM.started_at >= since)
            .order_by(FocusSessionORM.started_at.desc())
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def count_completed_today(self, *, user_id: str, day_start: datetime) -> int:
        stmt = select(func.count()).select_from(FocusSessionORM).where(
            FocusSessionORM.user_id == user_id,
            FocusSessionORM.status == FocusSessionStatus.COMPLETED.value,
            FocusSessionORM.mode == FocusSessionMode.FOCUS.value,
            FocusSessionORM.started_at >= day_start,
        )
        return int((await self._s.execute(stmt)).scalar_one())

    async def daily_leaderboard(
        self, *, day_start: datetime, limit: int
    ) -> list[tuple[str, int]]:
        stmt = (
            select(FocusSessionORM.user_id, func.count().label("c"))
            .where(
                FocusSessionORM.status == FocusSessionStatus.COMPLETED.value,
                FocusSessionORM.mode == FocusSessionMode.FOCUS.value,
                FocusSessionORM.started_at >= day_start,
            )
            .group_by(FocusSessionORM.user_id)
            .order_by(func.count().desc())
            .limit(limit)
        )
        return [(uid, int(c)) for uid, c in (await self._s.execute(stmt)).all()]
