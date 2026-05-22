from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus


@dataclass(slots=True, frozen=True)
class UserFocusTotals:
    """Aggregate counts over completed focus sessions for one user."""

    completed_focus_count: int
    completed_focus_seconds: int
    week_focus_seconds: int


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

    async def user_totals(
        self, *, user_id: str, week_start: datetime
    ) -> UserFocusTotals:
        """Lifetime and week-to-date totals over completed focus sessions."""
        ...

    async def completed_focus_days_since(
        self, *, user_id: str, since: datetime
    ) -> list[datetime]:
        """Distinct UTC days the user completed at least one focus session
        on or after ``since`` (inclusive), sorted descending. Used by the
        streak walker to find the longest unbroken run ending today."""
        ...

    async def weekly_rank(
        self, *, user_id: str, week_start: datetime
    ) -> int:
        """Rank (1-based) of ``user_id`` by completed focus count this
        week. Returns 0 if the user has no completed focus sessions in
        the window — frontend renders ``—`` for 0."""
        ...

    async def weekly_heatmap(
        self, *, user_id: str, week_start: datetime
    ) -> list[list[int]]:
        """7-by-24 grid (day_of_week, hour) of completed-focus counts for
        the trailing week. Empty rows for new accounts are still
        returned (all zeros). Day-of-week is Monday-based (0-indexed)."""
        ...
