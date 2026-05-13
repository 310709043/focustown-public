from __future__ import annotations

from datetime import datetime
from typing import Protocol

from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus


class IFocusSessionRepo(Protocol):
    async def create(
        self,
        *,
        session_id: str,
        user_id: str,
        mode: FocusSessionMode,
        duration_seconds: int,
        task_label: str | None,
        partner_user_id: str | None,
        started_at: datetime,
    ) -> FocusSession: ...

    async def get(self, session_id: str) -> FocusSession | None: ...

    async def update_status(
        self,
        *,
        session_id: str,
        status: FocusSessionStatus,
        elapsed_seconds: int,
        ended_at: datetime | None,
    ) -> FocusSession: ...

    async def list_active(self) -> list[FocusSession]: ...

    async def list_by_user_since(
        self, *, user_id: str, since: datetime
    ) -> list[FocusSession]: ...

    async def count_completed_today(self, *, user_id: str, day_start: datetime) -> int: ...

    async def daily_leaderboard(self, *, day_start: datetime, limit: int) -> list[tuple[str, int]]:
        """Returns [(user_id, completed_count)] sorted desc."""
        ...
