"""Wallet router integration tests.

Worth testing:
- New user has no wallet rows (empty list) until first credit
- transactions endpoint paginates and respects ``limit``

NOT worth testing:
- The trivial DTO shape — covered indirectly by other wallet-touching flows
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_new_user_starts_with_empty_wallet_list(client, auth_headers):
    response = await client.get("/api/v1/me/wallet", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_transactions_empty_for_new_user(client, auth_headers):
    response = await client.get(
        "/api/v1/me/wallet/transactions", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_transactions_rejects_invalid_limit(client, auth_headers):
    response = await client.get(
        "/api/v1/me/wallet/transactions?limit=0", headers=auth_headers
    )
    assert response.status_code == 422
