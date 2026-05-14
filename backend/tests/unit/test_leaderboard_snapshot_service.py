from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime

import pytest

from app.domain.models import FocusSession, User
from app.domain.services.leaderboard_service import LeaderboardService
from tests.unit.fakes import FakeClock, FakeLeaderboardSnapshotRepo, FakeUserRepo


@dataclass
class _FakeSessionRepo:
    """Inline minimal IFocusSessionRepo — only ``daily_leaderboard`` is exercised
    by the snapshot service. Other methods raise so any accidental use blows up
    loudly rather than returning a misleading empty value."""

    by_day: dict[date, list[tuple[str, int]]] = field(default_factory=dict)

    async def daily_leaderboard(
        self, *, day_start: datetime, limit: int
    ) -> list[tuple[str, int]]:
        return self.by_day.get(day_start.date(), [])[:limit]

    async def create(self, **_kwargs):
        raise NotImplementedError

    async def get(self, _session_id: str) -> FocusSession | None:
        raise NotImplementedError

    async def update_status(self, **_kwargs):
        raise NotImplementedError

    async def list_active(self) -> list[FocusSession]:
        raise NotImplementedError

    async def list_by_user_since(self, **_kwargs):
        raise NotImplementedError

    async def count_completed_today(self, **_kwargs) -> int:
        raise NotImplementedError


def _user(uid: str) -> User:
    return User(
        id=uid,
        email=f"{uid}@example.com",
        display_name=uid,
        character_key=None,
        role_label=None,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_write_snapshot_for_yesterday_writes_ranked_rows() -> None:
    yesterday = date(2026, 5, 14)
    sessions = _FakeSessionRepo(
        by_day={yesterday: [("u-alice", 5), ("u-bob", 3)]}
    )
    users = FakeUserRepo.from_users([_user("u-alice"), _user("u-bob")])
    clock = FakeClock(current=datetime(2026, 5, 15, 3, 0, tzinfo=UTC))
    svc = LeaderboardService(sessions=sessions, users=users, clock=clock)
    snapshots = FakeLeaderboardSnapshotRepo()

    written = await svc.write_snapshot_for_yesterday(snapshots=snapshots)

    assert written == 2
    alice = snapshots.rows[(yesterday, "u-alice")]
    bob = snapshots.rows[(yesterday, "u-bob")]
    assert alice.rank == 1
    assert alice.completed_count == 5
    assert bob.rank == 2
    assert bob.completed_count == 3


@pytest.mark.asyncio
async def test_write_snapshot_is_idempotent_on_rerun() -> None:
    yesterday = date(2026, 5, 14)
    sessions = _FakeSessionRepo(by_day={yesterday: [("u-alice", 5)]})
    users = FakeUserRepo.from_users([_user("u-alice")])
    clock = FakeClock(current=datetime(2026, 5, 15, 3, 0, tzinfo=UTC))
    svc = LeaderboardService(sessions=sessions, users=users, clock=clock)
    snapshots = FakeLeaderboardSnapshotRepo()

    first = await svc.write_snapshot_for_yesterday(snapshots=snapshots)
    second = await svc.write_snapshot_for_yesterday(snapshots=snapshots)

    assert first == 1
    assert second == 0
    assert len(snapshots.rows) == 1
