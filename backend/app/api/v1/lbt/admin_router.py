"""Admin review of LowBatteryTown safety reports."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.v1.lbt.schemas import (
    AdminLbtReportItem,
    AdminLbtReportList,
    AdminLbtReportStatusUpdate,
    ReportStatus,
)
from app.core.deps import AdminUserId, DbDep
from app.core.exceptions import NotFoundError
from app.infrastructure.db.repositories.lbt_report_repo import SqlLbtReportRepo

router = APIRouter()


@router.get("/reports", response_model=AdminLbtReportList)
async def list_reports(
    _admin: AdminUserId,
    db: DbDep,
    status: Annotated[ReportStatus | None, Query()] = "open",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AdminLbtReportList:
    records = await SqlLbtReportRepo(db).list_recent(status=status, limit=limit)
    return AdminLbtReportList(
        items=[
            AdminLbtReportItem(**{f: getattr(r, f) for f in AdminLbtReportItem.model_fields})
            for r in records
        ]
    )


@router.post("/reports/{report_id}/status", status_code=204)
async def set_report_status(
    report_id: str,
    body: AdminLbtReportStatusUpdate,
    _admin: AdminUserId,
    db: DbDep,
) -> None:
    if not await SqlLbtReportRepo(db).set_status(report_id, body.status):
        raise NotFoundError("report_not_found")
