from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta

from app.core.clock import IClock
from app.domain.models import User
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.leaderboard_snapshot_repo import (
    ILeaderboardSnapshotRepo,
    LeaderboardSnapshotRecord,
)
from app.domain.repositories.user_repo import IUserReader


@dataclass(slots=True)
class LeaderboardEntry:
    user: User
    completed_count: int


class LeaderboardService:
    def __init__(
        self,
        *,
        sessions: IFocusSessionRepo,
        users: IUserReader,
        clock: IClock,
    ) -> None:
        self._sessions = sessions
        self._users = users
        self._clock = clock

    async def today(self, *, limit: int = 10) -> list[LeaderboardEntry]:
        day_start = self._day_start(self._clock.now())
        rows = await self._sessions.daily_leaderboard(day_start=day_start, limit=limit)
        result: list[LeaderboardEntry] = []
        for user_id, count in rows:
            user = await self._users.get_by_id(user_id)
            if user is not None:
                result.append(LeaderboardEntry(user=user, completed_count=count))
        return result

    @staticmethod
    def _day_start(now: datetime) -> datetime:
        return datetime.combine(now.date(), time.min, tzinfo=now.tzinfo)

    async def yesterday_window(self) -> tuple[datetime, datetime]:
        end = self._day_start(self._clock.now())
        return end - timedelta(days=1), end

    async def write_snapshot_for_yesterday(
        self,
        *,
        snapshots: ILeaderboardSnapshotRepo,
        limit: int = 100,
    ) -> int:
        start, _end = await self.yesterday_window()
        rows = await self._sessions.daily_leaderboard(day_start=start, limit=limit)
        records = [
            LeaderboardSnapshotRecord(
                snapshot_date=start.date(),
                user_id=user_id,
                completed_count=count,
                rank=idx + 1,
            )
            for idx, (user_id, count) in enumerate(rows)
        ]
        return await snapshots.upsert_day(snapshot_date=start.date(), entries=records)
