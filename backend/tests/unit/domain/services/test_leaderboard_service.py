"""LeaderboardService unit tests.

Worth testing:
- ``_day_start`` returns midnight of the same date in the same tzinfo
- ``today`` aggregates only completed sessions in the current day window
- ``today`` filters out users that no longer exist (silent skip)
- ``yesterday_window`` boundary at midnight

NOT worth testing:
- Ordering of result list — the underlying repo decides (covered by the
  fake's sort key); re-asserting it tests the fake, not the service
- ``LeaderboardEntry`` dataclass equality
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.domain.models import FocusSessionMode, FocusSessionStatus
from app.domain.services.leaderboard_service import LeaderboardService
from tests.unit.fakes import FakeFocusSessionRepo, FakeUserRepo, make_user


@pytest.fixture
def sessions() -> FakeFocusSessionRepo:
    return FakeFocusSessionRepo()


@pytest.fixture
def users() -> FakeUserRepo:
    repo = FakeUserRepo()
    repo.users["u-alice"] = make_user("u-alice", display_name="Alice")
    repo.users["u-bob"] = make_user("u-bob", display_name="Bob")
    return repo


@pytest.fixture
def service(sessions, users, clock) -> LeaderboardService:
    return LeaderboardService(sessions=sessions, users=users, clock=clock)


async def _seed(repo: FakeFocusSessionRepo, **overrides):
    status = overrides.pop("status", FocusSessionStatus.ACTIVE)
    defaults = {
        "mode": FocusSessionMode.FOCUS,
        "duration_seconds": 600,
        "task_label": None,
        "partner_user_id": None,
    }
    defaults.update(overrides)
    s = await repo.create(**defaults)
    if status is FocusSessionStatus.COMPLETED:
        await repo.update_status(
            session_id=s.id,
            status=FocusSessionStatus.COMPLETED,
            elapsed_seconds=600,
            ended_at=defaults["started_at"] + timedelta(seconds=600),
        )


# ── _day_start ─────────────────────────────────────────────────────────────


def test_day_start_returns_midnight_same_tz():
    now = datetime(2026, 5, 15, 13, 47, 22, tzinfo=UTC)
    assert LeaderboardService._day_start(now) == datetime(2026, 5, 15, tzinfo=UTC)


def test_day_start_preserves_tzinfo():
    now = datetime(2026, 5, 15, 13, 47, tzinfo=UTC)
    assert LeaderboardService._day_start(now).tzinfo == UTC


# ── today ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_today_counts_only_completed_in_current_day(
    service, sessions, clock
):
    today_morning = clock.current.replace(hour=9)
    yesterday = clock.current - timedelta(days=1)

    await _seed(
        sessions,
        session_id="s-alice-today",
        user_id="u-alice",
        started_at=today_morning,
        status=FocusSessionStatus.COMPLETED,
    )
    await _seed(
        sessions,
        session_id="s-alice-yesterday",
        user_id="u-alice",
        started_at=yesterday,
        status=FocusSessionStatus.COMPLETED,
    )

    result = await service.today()

    alice_count = next(e.completed_count for e in result if e.user.id == "u-alice")
    assert alice_count == 1


@pytest.mark.asyncio
async def test_today_skips_users_not_found(service, sessions, clock):
    await _seed(
        sessions,
        session_id="s-ghost-1",
        user_id="u-ghost",  # not in users repo
        started_at=clock.current.replace(hour=9),
        status=FocusSessionStatus.COMPLETED,
    )

    result = await service.today()

    assert all(e.user.id != "u-ghost" for e in result)


@pytest.mark.asyncio
async def test_today_honors_limit(service, sessions, clock):
    today_morning = clock.current.replace(hour=9)
    for u in ("u-alice", "u-bob"):
        await _seed(
            sessions,
            session_id=f"s-{u}",
            user_id=u,
            started_at=today_morning,
            status=FocusSessionStatus.COMPLETED,
        )

    result = await service.today(limit=1)

    assert len(result) == 1


# ── yesterday_window ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_yesterday_window_spans_24h_to_midnight(service, clock):
    start, end = await service.yesterday_window()
    assert end == clock.current.replace(hour=0, minute=0, second=0, microsecond=0)


@pytest.mark.asyncio
async def test_yesterday_window_start_is_24h_before_end(service):
    start, end = await service.yesterday_window()
    assert end - start == timedelta(days=1)
