"""E2E: completing a focus session credits the user's T-coin wallet.

Why this earns an E2E test (per plan):
- Crosses: HTTP sessions router → FocusSessionService → EventBus →
  CoinAwardService subscriber → WalletService → SqlWalletRepo + ledger
- The riskiest cross-feature seam in the app: failure here means users
  complete focused work but their reward never materialises.

What's verified end-to-end:
- /sessions/{id}/complete returns 200
- The wallet shows a non-zero T balance afterwards
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_completing_session_credits_t_coins(
    client, auth_headers, coin_award_registered
):
    start = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 1800},
        headers=auth_headers,
    )
    sid = start.json()["id"]

    complete = await client.post(
        f"/api/v1/sessions/{sid}/complete", headers=auth_headers
    )
    assert complete.status_code == 200

    wallets = await client.get("/api/v1/me/wallet", headers=auth_headers)
    rows = wallets.json()
    t_wallet = next((r for r in rows if r["currency_code"] == "T"), None)
    assert t_wallet is not None
    # 30 min @ 100 cT / 30min = 100 cT. Allow exact match — the formula
    # is deterministic for an exact duration.
    assert t_wallet["balance_minor"] == 100
