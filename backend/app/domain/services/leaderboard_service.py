from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta

from app.core.clock import IClock
from app.domain.models import User
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.user_repo import IUserRepo


@dataclass(slots=True)
class LeaderboardEntry:
    user: User
    completed_count: int


class LeaderboardService:
    def __init__(
        self,
        *,
        sessions: IFocusSessionRepo,
        users: IUserRepo,
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
