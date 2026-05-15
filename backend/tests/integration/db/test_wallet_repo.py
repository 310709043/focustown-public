"""SqlWalletRepo against real Postgres.

Worth testing:
- ``adjust`` returns the new balance on credit
- ``adjust`` returns None (and does NOT mutate balance) when delta would
  drive balance < 0 — this is the InsufficientFunds signal
- ``get_or_create`` is idempotent for the same (user, currency) pair

NOT worth testing:
- ``_to_domain`` mapping — covered indirectly
- ``list_for_user`` shape — trivial
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from app.infrastructure.db.repositories import SqlWalletRepo


async def _create_user(db_session, user_id: str = "u-wallet-test"):
    await db_session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, "
            "is_active, created_at, updated_at) VALUES "
            "(:id, :email, 'x', 'WT', true, :now, :now)"
        ),
        {
            "id": user_id,
            "email": f"{user_id}@example.com",
            "now": datetime.now(UTC).replace(tzinfo=None),
        },
    )


@pytest.mark.asyncio
async def test_adjust_credits_balance(db_session):
    await _create_user(db_session)
    repo = SqlWalletRepo(db_session)
    wallet = await repo.get_or_create(
        user_id="u-wallet-test", currency_code="T", wallet_id="w-1"
    )

    new_balance = await repo.adjust(wallet_id=wallet.id, delta_minor=250)

    assert new_balance == 250


@pytest.mark.asyncio
async def test_adjust_returns_none_when_would_go_negative(db_session):
    await _create_user(db_session, user_id="u-wallet-debit-test")
    repo = SqlWalletRepo(db_session)
    wallet = await repo.get_or_create(
        user_id="u-wallet-debit-test", currency_code="T", wallet_id="w-2"
    )
    await repo.adjust(wallet_id=wallet.id, delta_minor=100)

    result = await repo.adjust(wallet_id=wallet.id, delta_minor=-200)

    assert result is None


@pytest.mark.asyncio
async def test_adjust_leaves_balance_unchanged_on_rejection(db_session):
    await _create_user(db_session, user_id="u-wallet-noop-test")
    repo = SqlWalletRepo(db_session)
    wallet = await repo.get_or_create(
        user_id="u-wallet-noop-test", currency_code="T", wallet_id="w-3"
    )
    await repo.adjust(wallet_id=wallet.id, delta_minor=100)
    await repo.adjust(wallet_id=wallet.id, delta_minor=-200)  # rejected

    fresh = await repo.get(user_id="u-wallet-noop-test", currency_code="T")

    assert fresh is not None
    assert fresh.balance_minor == 100


@pytest.mark.asyncio
async def test_get_or_create_is_idempotent(db_session):
    await _create_user(db_session, user_id="u-wallet-idem-test")
    repo = SqlWalletRepo(db_session)
    first = await repo.get_or_create(
        user_id="u-wallet-idem-test", currency_code="T", wallet_id="w-4"
    )
    second = await repo.get_or_create(
        user_id="u-wallet-idem-test", currency_code="T", wallet_id="w-5-other"
    )

    assert first.id == second.id
