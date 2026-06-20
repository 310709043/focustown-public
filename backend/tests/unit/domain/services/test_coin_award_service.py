from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.domain.events import SessionCompleted
from app.domain.services.coin_award_service import (
    CoinAwardService,
    _WalletServiceAcquired,
    compute_award_minor,
    compute_night_bonus,
    compute_streak_bonus,
    compute_streak_from_days,
)

# ── pure helpers ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("duration_seconds", "expected_minor"),
    [
        (0, 0),
        (-1, 0),
        (60, 3),       # 1 min  -> 3 cT (rounded down from 3.33)
        (900, 50),     # 15 min -> 50 cT = 0.5 T
        (1500, 83),    # 25 min -> 83 cT (rounded down from 83.33)
        (1800, 100),   # 30 min -> 100 cT = 1 T
        (3600, 200),   # 60 min -> 200 cT = 2 T
    ],
)
def test_compute_award_minor_table(duration_seconds: int, expected_minor: int):
    assert compute_award_minor(duration_seconds) == expected_minor


@pytest.mark.parametrize(
    ("utc_hour", "expected"),
    [
        (16, 10),  # 00:00 UTC+8
        (17, 10),  # 01:00 UTC+8
        (19, 10),  # 03:00 UTC+8
        (20, 0),   # 04:00 UTC+8 -- boundary, not included
        (12, 0),   # 20:00 UTC+8
        (0, 0),    # 08:00 UTC+8
        (8, 0),    # 16:00 UTC+8
    ],
)
def test_compute_night_bonus_by_utc_hour(utc_hour: int, expected: int):
    dt = datetime(2026, 6, 15, utc_hour, 30, 0, tzinfo=UTC)
    assert compute_night_bonus(dt) == expected


@pytest.mark.parametrize(
    ("days", "expected"),
    [
        (0, 0), (1, 0), (2, 0),
        (3, 5), (6, 5),
        (7, 10), (13, 10),
        (14, 20), (29, 20),
        (30, 30), (100, 30),
    ],
)
def test_compute_streak_bonus(days: int, expected: int):
    assert compute_streak_bonus(days) == expected


class TestComputeStreakFromDays:
    def test_empty_list(self):
        assert compute_streak_from_days([], date(2026, 6, 15)) == 0

    def test_today_only(self):
        days = [datetime(2026, 6, 15, 10, 0, tzinfo=UTC)]
        assert compute_streak_from_days(days, date(2026, 6, 15)) == 1

    def test_three_consecutive(self):
        days = [
            datetime(2026, 6, 15, 10, 0, tzinfo=UTC),
            datetime(2026, 6, 14, 8, 0, tzinfo=UTC),
            datetime(2026, 6, 13, 9, 0, tzinfo=UTC),
        ]
        assert compute_streak_from_days(days, date(2026, 6, 15)) == 3

    def test_gap_breaks_streak(self):
        days = [
            datetime(2026, 6, 15, 10, 0, tzinfo=UTC),
            datetime(2026, 6, 13, 9, 0, tzinfo=UTC),
        ]
        assert compute_streak_from_days(days, date(2026, 6, 15)) == 1

    def test_grace_yesterday(self):
        days = [
            datetime(2026, 6, 14, 10, 0, tzinfo=UTC),
            datetime(2026, 6, 13, 10, 0, tzinfo=UTC),
        ]
        assert compute_streak_from_days(days, date(2026, 6, 15)) == 2

    def test_no_grace_if_two_days_ago(self):
        days = [datetime(2026, 6, 13, 10, 0, tzinfo=UTC)]
        assert compute_streak_from_days(days, date(2026, 6, 15)) == 0


# ── handler ───────────────────────────────────────────────────────────────


class RecordingWalletService:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def credit(self, **kwargs):
        self.calls.append(kwargs)


class StubAcquired:
    def __init__(self, ws):
        self.wallet_service = ws
        self.focus_sessions = None
        self.committed = False
        self.rolled_back = False
        self.closed = False

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    async def close(self):
        self.closed = True


def _event(*, user_id="u1", session_id="s1", duration=1800, ended_at=None) -> SessionCompleted:
    return SessionCompleted(
        session_id=session_id,
        user_id=user_id,
        partner_user_id=None,
        duration_seconds=duration,
        ended_at=ended_at or datetime.now(UTC),
    )


def _wrap(stub: StubAcquired) -> _WalletServiceAcquired:
    return _WalletServiceAcquired(
        wallet_service=stub.wallet_service,
        focus_sessions=stub.focus_sessions,
        commit=stub.commit,
        rollback=stub.rollback,
        close=stub.close,
    )


@pytest.mark.asyncio
async def test_handler_credits_with_metadata():
    ws = RecordingWalletService()
    acquired = StubAcquired(ws)
    svc = CoinAwardService(factory=lambda: _wrap(acquired))

    await svc._on_session_completed(_event(duration=1800))

    assert len(ws.calls) == 1
    call = ws.calls[0]
    assert call["user_id"] == "u1"
    assert call["currency_code"] == "T"
    assert call["reason"] == "session_complete"
    assert call["ref_type"] == "focus_session"
    assert call["ref_id"] == "s1"
    assert "metadata" in call
    assert call["metadata"]["base"] == 100
    assert acquired.committed and acquired.closed and not acquired.rolled_back


@pytest.mark.asyncio
async def test_handler_skips_when_duration_zero():
    ws = RecordingWalletService()
    acquired = StubAcquired(ws)
    svc = CoinAwardService(factory=lambda: _wrap(acquired))

    # Night bonus is 0 at noon UTC -> total is 0 -> skipped
    await svc._on_session_completed(_event(
        duration=0,
        ended_at=datetime(2026, 6, 15, 12, 0, 0, tzinfo=UTC),
    ))

    assert ws.calls == []


@pytest.mark.asyncio
async def test_handler_night_bonus_added():
    ws = RecordingWalletService()
    acquired = StubAcquired(ws)
    svc = CoinAwardService(factory=lambda: _wrap(acquired))

    # 17:00 UTC = 01:00 UTC+8 -> night bonus applies
    await svc._on_session_completed(_event(
        duration=1800,
        ended_at=datetime(2026, 6, 15, 17, 0, 0, tzinfo=UTC),
    ))

    assert len(ws.calls) == 1
    call = ws.calls[0]
    assert call["amount_minor"] == 110  # 100 base + 10 night
    assert call["metadata"]["night"] == 10
