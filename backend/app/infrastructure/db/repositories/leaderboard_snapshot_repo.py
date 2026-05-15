from __future__ import annotations

from datetime import date

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import UUID4Generator
from app.domain.repositories.leaderboard_snapshot_repo import (
    ILeaderboardSnapshotRepo,
    LeaderboardSnapshotRecord,
)
from app.infrastructure.db.models.leaderboard_snapshot import LeaderboardSnapshotORM


class SqlLeaderboardSnapshotRepo(ILeaderboardSnapshotRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._ids = UUID4Generator()

    async def upsert_day(
        self,
        *,
        snapshot_date: date,
        entries: list[LeaderboardSnapshotRecord],
    ) -> int:
        if not entries:
            return 0
        values = [
            {
                "id": self._ids.new_id(),
                "snapshot_date": snapshot_date,
                "user_id": e.user_id,
                "completed_count": e.completed_count,
                "rank": e.rank,
            }
            for e in entries
        ]
        stmt = pg_insert(LeaderboardSnapshotORM).values(values).on_conflict_do_nothing(
            constraint="uq_leaderboard_snapshot_day_user"
        )
        result = await self._s.execute(stmt)
        return result.rowcount or 0
