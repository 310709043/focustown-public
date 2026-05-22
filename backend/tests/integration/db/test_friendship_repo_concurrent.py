"""SqlFriendshipRepo.create_request under concurrent first-request calls.

Phase 03 pins: two concurrent ``create_request`` calls for the same
pair collapse to exactly one friendship row, and both callers observe
the same canonical id. The service layer already short-circuits
duplicates via ``get_between``; this repo guard catches the race window
where two requests slip past that check before either has flushed.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.infrastructure.db.repositories import SqlFriendshipRepo

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def seeded_pair(integration_env):
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    requester_id = str(uuid4())
    target_id = str(uuid4())
    now_naive = datetime.now(UTC).replace(tzinfo=None)
    try:
        async with engine.begin() as conn:
            for uid, email in [
                (requester_id, f"r-{requester_id}@friend-concurrent.test"),
                (target_id, f"t-{target_id}@friend-concurrent.test"),
            ]:
                await conn.execute(
                    text(
                        "INSERT INTO users (id, email, password_hash, "
                        "display_name, is_active, is_bot, marketing_opt_in, "
                        "created_at, updated_at) VALUES (:id, :email, 'x', "
                        "'FC', true, false, false, :now, :now)"
                    ),
                    {"id": uid, "email": email, "now": now_naive},
                )
        yield {"requester_id": requester_id, "target_id": target_id}
    finally:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "DELETE FROM friendships WHERE user_low_id IN (:a, :b) "
                    "OR user_high_id IN (:a, :b)"
                ),
                {"a": requester_id, "b": target_id},
            )
            await conn.execute(
                text("DELETE FROM users WHERE id IN (:a, :b)"),
                {"a": requester_id, "b": target_id},
            )
        await engine.dispose()


async def _create_request_in_own_tx(
    db_url: str,
    *,
    friendship_id: str,
    requester_id: str,
    target_id: str,
) -> str:
    engine = create_async_engine(db_url, future=True)
    try:
        async with engine.connect() as conn:
            async with conn.begin():
                session = AsyncSession(bind=conn, expire_on_commit=False)
                try:
                    repo = SqlFriendshipRepo(session)
                    row = await repo.create_request(
                        friendship_id=friendship_id,
                        requester_id=requester_id,
                        target_id=target_id,
                    )
                    return row.id
                finally:
                    await session.close()
    finally:
        await engine.dispose()


async def test_concurrent_create_request_yields_one_row(
    integration_env, seeded_pair
):
    requester_id = seeded_pair["requester_id"]
    target_id = seeded_pair["target_id"]
    id_a = str(uuid4())
    id_b = str(uuid4())

    results = await asyncio.gather(
        _create_request_in_own_tx(
            integration_env["DATABASE_URL"],
            friendship_id=id_a,
            requester_id=requester_id,
            target_id=target_id,
        ),
        _create_request_in_own_tx(
            integration_env["DATABASE_URL"],
            friendship_id=id_b,
            requester_id=requester_id,
            target_id=target_id,
        ),
    )

    # Both callers observe the same canonical row id.
    assert results[0] == results[1]
    assert results[0] in {id_a, id_b}

    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    try:
        async with engine.connect() as conn:
            count = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM friendships WHERE "
                        "(user_low_id = :a AND user_high_id = :b) OR "
                        "(user_low_id = :b AND user_high_id = :a)"
                    ),
                    {"a": requester_id, "b": target_id},
                )
            ).scalar_one()
            assert count == 1
    finally:
        await engine.dispose()
