"""SqlWalletRepo.get_or_create under concurrent first-credit events.

Phase 03 pins: two concurrent ``get_or_create`` calls for the same
(user_id, currency_code) must collapse to exactly one wallet row and
both callers see the same id. Before the ON CONFLICT switch the second
caller hit the unique constraint and raised a 500.

Uses two independent engines so each call commits on its own
connection — sharing a session inside a SAVEPOINT would not exercise
the race window.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.infrastructure.db.repositories import SqlWalletRepo

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def seeded_user(integration_env):
    """Insert a user via a throwaway engine so the row is visible across
    both independent connections used by the race test."""
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    user_id = str(uuid4())
    now_naive = datetime.now(UTC).replace(tzinfo=None)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, password_hash, "
                    "display_name, is_active, is_bot, marketing_opt_in, "
                    "created_at, updated_at) VALUES (:id, :email, 'x', "
                    "'WC', true, false, false, :now, :now)"
                ),
                {
                    "id": user_id,
                    "email": f"wc-{user_id}@wallet-concurrent.test",
                    "now": now_naive,
                },
            )
        yield user_id
    finally:
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM user_wallets WHERE user_id = :uid"),
                {"uid": user_id},
            )
            await conn.execute(
                text("DELETE FROM users WHERE id = :uid"), {"uid": user_id}
            )
        await engine.dispose()


async def _create_in_own_tx(
    db_url: str, *, user_id: str, currency_code: str, wallet_id: str
) -> str:
    engine = create_async_engine(db_url, future=True)
    try:
        async with engine.connect() as conn:
            async with conn.begin():
                session = AsyncSession(bind=conn, expire_on_commit=False)
                try:
                    repo = SqlWalletRepo(session)
                    wallet = await repo.get_or_create(
                        user_id=user_id,
                        currency_code=currency_code,
                        wallet_id=wallet_id,
                    )
                    return wallet.id
                finally:
                    await session.close()
    finally:
        await engine.dispose()


async def test_concurrent_get_or_create_yields_one_row(
    integration_env, seeded_user
):
    user_id = seeded_user
    id_a = str(uuid4())
    id_b = str(uuid4())

    results = await asyncio.gather(
        _create_in_own_tx(
            integration_env["DATABASE_URL"],
            user_id=user_id,
            currency_code="T",
            wallet_id=id_a,
        ),
        _create_in_own_tx(
            integration_env["DATABASE_URL"],
            user_id=user_id,
            currency_code="T",
            wallet_id=id_b,
        ),
    )

    # Both callers observe the same canonical wallet id.
    assert results[0] == results[1]
    # The canonical id is whichever ON CONFLICT-suppressed candidate the
    # winning INSERT used; both are valid candidates.
    assert results[0] in {id_a, id_b}

    # Exactly one row in PG for this (user_id, currency_code).
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    try:
        async with engine.connect() as conn:
            count = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM user_wallets WHERE user_id = "
                        ":uid AND currency_code = 'T'"
                    ),
                    {"uid": user_id},
                )
            ).scalar_one()
            assert count == 1
    finally:
        await engine.dispose()
