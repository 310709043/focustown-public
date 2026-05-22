from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import UUID4Generator
from app.core.pagination import apply_keyset
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
        created_at=row.created_at,
    )


class SqlAchievementRepo(IAchievementRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._ids = UUID4Generator()

    async def list_all(
        self,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[AchievementRecord]:
        stmt = select(AchievementORM)
        stmt = apply_keyset(
            stmt,
            ts_col=AchievementORM.created_at,
            id_col=AchievementORM.code,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            AchievementORM.created_at.desc(), AchievementORM.code.desc()
        ).limit(limit + 1)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_record(r) for r in rows]

    async def list_for_user(
        self,
        user_id: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[AchievementRecord]:
        stmt = (
            select(AchievementORM)
            .join(
                UserAchievementORM,
                UserAchievementORM.achievement_code == AchievementORM.code,
            )
            .where(UserAchievementORM.user_id == user_id)
        )
        stmt = apply_keyset(
            stmt,
            ts_col=AchievementORM.created_at,
            id_col=AchievementORM.code,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            AchievementORM.created_at.desc(), AchievementORM.code.desc()
        ).limit(limit + 1)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_record(r) for r in rows]

    async def grant(self, *, user_id: str, achievement_code: str) -> bool:
        # Atomic INSERT-or-skip on the (user_id, achievement_code) unique
        # constraint. Previously this caught IntegrityError and rolled the
        # transaction back on every duplicate — aborting any other writes
        # the caller had batched. ON CONFLICT keeps the transaction alive;
        # rowcount tells us whether we actually granted (1) or it was
        # already held (0).
        stmt = (
            pg_insert(UserAchievementORM)
            .values(
                id=self._ids.new_id(),
                user_id=user_id,
                achievement_code=achievement_code,
            )
            .on_conflict_do_nothing(
                index_elements=["user_id", "achievement_code"]
            )
        )
        result = await self._s.execute(stmt)
        return bool(result.rowcount)
