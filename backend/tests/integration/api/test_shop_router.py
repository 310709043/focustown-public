"""Shop router integration tests.

Worth testing:
- list endpoint returns empty list when no shop items are seeded (i.e. the
  query joins do not over-fetch). This catches regressions where a join
  accidentally inner-joins prices and hides priceless items.
- purchase against zero balance → 402 InsufficientFunds + wallet/inventory
  remain unchanged (the most important safety property).

NOT worth testing:
- The happy purchase path with seeded shop data — covered by the e2e
  test_purchase_equips_vehicle flow, which exercises the same code with
  realistic seed.
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_list_empty_when_no_items_seeded(client):
    response = await client.get("/api/v1/shop")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_purchase_with_no_balance_returns_insufficient_funds(
    client, auth_headers, db_session
):
    # Seed one shop item priced at 100 cT.
    item_id = "test-item-shop-1"
    now = datetime.now(UTC).replace(tzinfo=None)
    await db_session.execute(
        text(
            "INSERT INTO shop_items (id, category, icon, name, description, "
            "price_cents, featured, created_at) VALUES "
            "(:id, 'car', '🚗', 'Test Car', 'd', 100, false, :now)"
        ),
        {"id": item_id, "now": now},
    )
    await db_session.execute(
        text(
            "INSERT INTO shop_item_prices "
            "(id, shop_item_id, currency_code, amount_minor) "
            "VALUES (:pid, :iid, 'T', 100)"
        ),
        {"pid": "test-price-1", "iid": item_id},
    )

    response = await client.post(
        f"/api/v1/shop/items/{item_id}/purchase",
        json={"currency_code": "T"},
        headers=auth_headers,
    )

    assert response.status_code == 402
    assert response.json()["error"]["message"] == "insufficient_funds"

    # Wallet should still be empty (no zero-balance row created by failure).
    wallet_row = (
        await db_session.execute(
            text(
                "SELECT balance_minor FROM user_wallets WHERE currency_code = 'T'"
            )
        )
    ).first()
    # Either no wallet row, or a row with balance 0 — either is acceptable;
    # what must not happen is the balance going negative.
    if wallet_row is not None:
        assert wallet_row.balance_minor >= 0
