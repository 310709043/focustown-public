from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.lbt import ILbtReportRepo, LbtReportRecord
from app.infrastructure.db.models.lbt_report import LbtReportORM


def _to_record(row: LbtReportORM) -> LbtReportRecord:
    return LbtReportRecord(
        id=row.id,
        conversation_id=row.conversation_id,
        reporter_guest_id=row.reporter_guest_id,
        reported_guest_id=row.reported_guest_id,
        reason=row.reason,
        note=row.note,
        transcript=list(row.transcript),
        reporter_profile=dict(row.reporter_profile),
        reported_profile=dict(row.reported_profile),
        status=row.status,
        created_at=row.created_at,
    )


class SqlLbtReportRepo(ILbtReportRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(self, record: LbtReportRecord) -> None:
        self._s.add(
            LbtReportORM(
                id=record.id,
                conversation_id=record.conversation_id,
                reporter_guest_id=record.reporter_guest_id,
                reported_guest_id=record.reported_guest_id,
                reason=record.reason,
                note=record.note,
                transcript=record.transcript,
                reporter_profile=record.reporter_profile,
                reported_profile=record.reported_profile,
                status=record.status,
                created_at=record.created_at,
            )
        )
        await self._s.flush()

    async def list_recent(self, *, status: str | None, limit: int) -> list[LbtReportRecord]:
        stmt = select(LbtReportORM).order_by(LbtReportORM.created_at.desc()).limit(limit)
        if status is not None:
            stmt = stmt.where(LbtReportORM.status == status)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_record(row) for row in rows]

    async def set_status(self, report_id: str, status: str) -> bool:
        result = await self._s.execute(
            update(LbtReportORM).where(LbtReportORM.id == report_id).values(status=status)
        )
        return bool(result.rowcount)
