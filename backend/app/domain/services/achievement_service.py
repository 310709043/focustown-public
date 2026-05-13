from __future__ import annotations

from datetime import timedelta

from app.core.clock import IClock
from app.core.events import EventBus
from app.domain.events import SessionCompleted
from app.domain.repositories.achievement_repo import (
    AchievementRecord,
    IAchievementRepo,
)
from app.domain.repositories.focus_session_repo import IFocusSessionRepo


class AchievementService:
    """Subscribes to SessionCompleted and unlocks badges when thresholds are crossed."""

    def __init__(
        self,
        *,
        achievements: IAchievementRepo,
        sessions: IFocusSessionRepo,
        clock: IClock,
        events: EventBus,
    ) -> None:
        self._achievements = achievements
        self._sessions = sessions
        self._clock = clock
        events.subscribe(SessionCompleted, self._on_session_completed)

    async def list_for_user(self, user_id: str) -> list[AchievementRecord]:
        return await self._achievements.list_for_user(user_id)

    async def _on_session_completed(self, event: SessionCompleted) -> None:
        # 7-day check: today + 6 distinct prior days
        now = self._clock.now()
        sessions = await self._sessions.list_by_user_since(
            user_id=event.user_id, since=now - timedelta(days=7)
        )
        distinct_days = {s.started_at.date() for s in sessions if s.status.value == "completed"}
        if len(distinct_days) >= 7:
            await self._achievements.grant(user_id=event.user_id, achievement_code="streak_7")

        completed_today = await self._sessions.count_completed_today(
            user_id=event.user_id,
            day_start=now.replace(hour=0, minute=0, second=0, microsecond=0),
        )
        if completed_today >= 15:
            await self._achievements.grant(
                user_id=event.user_id, achievement_code="sprint_15"
            )
        if now.hour < 6 or now.hour >= 22:
            await self._achievements.grant(user_id=event.user_id, achievement_code="night_owl")
