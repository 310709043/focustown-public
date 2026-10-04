from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.lbt import ILbtFeedbackRepo, LbtFeedbackRecord
from app.infrastructure.db.models.lbt_feedback import LbtFeedbackORM


def _to_record(row: LbtFeedbackORM) -> LbtFeedbackRecord:
    return LbtFeedbackRecord(
        id=row.id,
        category=row.category,
        message=row.message,
        email=row.email,
        page=row.page,
        locale=row.locale,
        status=row.status,
        created_at=row.created_at,
        sheet_sent=row.sheet_sent,
    )


class SqlLbtFeedbackRepo(ILbtFeedbackRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(self, record: LbtFeedbackRecord) -> None:
        self._s.add(
            LbtFeedbackORM(
                id=record.id,
                category=record.category,
                message=record.message,
                email=record.email,
                page=record.page,
                locale=record.locale,
                status=record.status,
                sheet_sent=record.sheet_sent,
                created_at=record.created_at,
            )
        )
        await self._s.flush()

    async def list_recent(self, *, status: str | None, limit: int) -> list[LbtFeedbackRecord]:
        stmt = select(LbtFeedbackORM).order_by(LbtFeedbackORM.created_at.desc()).limit(limit)
        if status is not None:
            stmt = stmt.where(LbtFeedbackORM.status == status)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_record(row) for row in rows]

    async def set_status(self, feedback_id: str, status: str) -> bool:
        result = await self._s.execute(
            update(LbtFeedbackORM).where(LbtFeedbackORM.id == feedback_id).values(status=status)
        )
        return bool(result.rowcount)

    async def mark_sheet_sent(self, feedback_id: str) -> None:
        await self._s.execute(
            update(LbtFeedbackORM).where(LbtFeedbackORM.id == feedback_id).values(sheet_sent=True)
        )

    async def delete_older_than(self, cutoff: datetime) -> int:
        result = await self._s.execute(
            delete(LbtFeedbackORM).where(LbtFeedbackORM.created_at < cutoff)
        )
        return int(result.rowcount or 0)
