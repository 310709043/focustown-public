from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(slots=True, frozen=True)
class LeaderboardSnapshotRecord:
    snapshot_date: date
    user_id: str
    completed_count: int
    rank: int


class ILeaderboardSnapshotRepo(Protocol):
    """Port for persisting daily leaderboard snapshots.

    The worker writes one row per top-N user per day after midnight, so
    historical leaderboard reads don't have to re-aggregate the focus_sessions
    table. ``upsert_day`` is idempotent on ``(snapshot_date, user_id)``
    so re-running the cron (or replaying it after a crash) is safe.
    """

    async def upsert_day(
        self,
        *,
        snapshot_date: date,
        entries: list[LeaderboardSnapshotRecord],
    ) -> int:
        """Insert entries for ``snapshot_date``; skip rows whose
        ``(snapshot_date, user_id)`` already exists. Returns the number of
        rows newly inserted (existing rows count zero)."""
        ...
