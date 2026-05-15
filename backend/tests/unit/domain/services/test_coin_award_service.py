from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.events import SessionCompleted
from app.domain.services.coin_award_service import (
    CoinAwardService,
    _WalletServiceAcquired,
    compute_award_minor,
)

# ── pure helper ────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("duration_seconds", "expected_minor"),
    [
        (0, 0),
        (-1, 0),
        (60, 3),       # 1 min  → 3 cT (rounded down from 3.33)
        (900, 50),     # 15 min → 50 cT = 0.5 T
        (1500, 83),    # 25 min → 83 cT (rounded down from 83.33)
        (1800, 100),   # 30 min → 100 cT = 1 T
        (3600, 200),   # 60 min → 200 cT = 2 T
    ],
)
def test_compute_award_minor_table(duration_seconds: int, expected_minor: int):
    assert compute_award_minor(duration_seconds) == expected_minor


# ── handler ────────────────────────────────────────────────────────────────

class RecordingWalletService:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def credit(self, **kwargs):
        self.calls.append(kwargs)


class StubAcquired:
    def __init__(self, ws):
        self.wallet_service = ws
        self.committed = False
        self.rolled_back = False
        self.closed = False

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    async def close(self):
        self.closed = True


def _event(*, user_id="u1", session_id="s1", duration=1800) -> SessionCompleted:
    return SessionCompleted(
        session_id=session_id,
        user_id=user_id,
        partner_user_id=None,
        duration_seconds=duration,
        ended_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_handler_credits_with_idempotency_ref():
    ws = RecordingWalletService()
    acquired = StubAcquired(ws)
    svc = CoinAwardService(factory=lambda: _wrap(acquired))

    await svc._on_session_completed(_event(duration=1800))

    assert ws.calls == [
        {
            "user_id": "u1",
            "currency_code": "T",
            "amount_minor": 100,
            "reason": "session_complete",
            "ref_type": "focus_session",
            "ref_id": "s1",
        }
    ]
    assert acquired.committed and acquired.closed and not acquired.rolled_back


@pytest.mark.asyncio
async def test_handler_skips_when_duration_zero():
    ws = RecordingWalletService()
    acquired = StubAcquired(ws)
    svc = CoinAwardService(factory=lambda: _wrap(acquired))

    await svc._on_session_completed(_event(duration=0))

    assert ws.calls == []
    # factory never invoked when award is 0 → no session opened
    assert not acquired.committed
    assert not acquired.closed


def _wrap(stub: StubAcquired) -> _WalletServiceAcquired:
    return _WalletServiceAcquired(
        wallet_service=stub.wallet_service,
        commit=stub.commit,
        rollback=stub.rollback,
        close=stub.close,
    )
