from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import UUID4Generator
from app.domain.repositories.achievement_repo import (
    AchievementRecord,
    IAchievementRepo,
)
from app.infrastructure.db.models.achievement import AchievementORM, UserAchievementORM


def _to_record(row: AchievementORM) -> AchievementRecord:
    return AchievementRecord(
        code=row.code,
        icon=row.icon,
        title=row.title,
        description=row.description,
    )


class SqlAchievementRepo(IAchievementRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._ids = UUID4Generator()

    async def list_all(self) -> list[AchievementRecord]:
        rows = (await self._s.execute(select(AchievementORM))).scalars().all()
        return [_to_record(r) for r in rows]

    async def list_for_user(self, user_id: str) -> list[AchievementRecord]:
        stmt = (
            select(AchievementORM)
            .join(
                UserAchievementORM,
                UserAchievementORM.achievement_code == AchievementORM.code,
            )
            .where(UserAchievementORM.user_id == user_id)
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_record(r) for r in rows]

    async def grant(self, *, user_id: str, achievement_code: str) -> bool:
        row = UserAchievementORM(
            id=self._ids.new_id(),
            user_id=user_id,
            achievement_code=achievement_code,
        )
        self._s.add(row)
        try:
            await self._s.flush()
            return True
        except IntegrityError:
            await self._s.rollback()
            return False
