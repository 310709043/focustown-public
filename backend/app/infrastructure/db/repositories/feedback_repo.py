from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.feedback_repo import FeedbackRecord, IFeedbackRepo
from app.infrastructure.db.models.feedback import FeedbackSubmissionORM


def _to_record(row: FeedbackSubmissionORM) -> FeedbackRecord:
    return FeedbackRecord(
        id=row.id,
        user_id=row.user_id,
        category=row.category,
        body=row.body,
        contact_email=row.contact_email,
        status=row.status,
        locale=row.locale,
        app_version=row.app_version,
        context=row.context,
        created_at=row.created_at,
    )


class SqlFeedbackRepo(IFeedbackRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(
        self,
        *,
        feedback_id: str,
        user_id: str | None,
        category: str,
        body: str,
        contact_email: str | None,
        locale: str,
        app_version: str | None,
        context: dict[str, Any] | None,
    ) -> FeedbackRecord:
        row = FeedbackSubmissionORM(
            id=feedback_id,
            user_id=user_id,
            category=category,
            body=body,
            contact_email=contact_email,
            locale=locale,
            app_version=app_version,
            context=context,
        )
        self._s.add(row)
        await self._s.flush()
        return _to_record(row)
