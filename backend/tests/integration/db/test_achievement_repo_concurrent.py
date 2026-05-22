"""SqlAchievementRepo.grant under concurrent first-grant calls.

Phase 03 pins: two concurrent ``grant`` calls for the same
(user_id, achievement_code) must collapse to exactly one row, and
exactly one caller reports the create (True) while the other observes
the conflict (False). Previously this used IntegrityError + rollback —
correct, but rolling back also aborted any other writes the caller had
batched into the same transaction.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.infrastructure.db.repositories import SqlAchievementRepo

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def seeded_user_and_achievement(integration_env):
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    user_id = str(uuid4())
    code = f"streak_{uuid4().hex[:8]}"
    now_naive = datetime.now(UTC).replace(tzinfo=None)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, password_hash, "
                    "display_name, is_active, is_bot, marketing_opt_in, "
                    "created_at, updated_at) VALUES (:id, :email, 'x', "
                    "'AC', true, false, false, :now, :now)"
                ),
                {
                    "id": user_id,
                    "email": f"ac-{user_id}@ach-concurrent.test",
                    "now": now_naive,
                },
            )
            await conn.execute(
                text(
                    "INSERT INTO achievements (id, code, icon, title, "
                    "description, created_at, updated_at) VALUES "
                    "(:id, :code, 'x', 't', 'd', :now, :now)"
                ),
                {
                    "id": str(uuid4()),
                    "code": code,
                    "now": now_naive,
                },
            )
        yield {"user_id": user_id, "achievement_code": code}
    finally:
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM user_achievements WHERE user_id = :uid"),
                {"uid": user_id},
            )
            await conn.execute(
                text("DELETE FROM users WHERE id = :uid"), {"uid": user_id}
            )
            await conn.execute(
                text("DELETE FROM achievements WHERE code = :code"),
                {"code": code},
            )
        await engine.dispose()


async def _grant_in_own_tx(
    db_url: str, *, user_id: str, achievement_code: str
) -> bool:
    engine = create_async_engine(db_url, future=True)
    try:
        async with engine.connect() as conn:
            async with conn.begin():
                session = AsyncSession(bind=conn, expire_on_commit=False)
                try:
                    repo = SqlAchievementRepo(session)
                    return await repo.grant(
                        user_id=user_id, achievement_code=achievement_code
                    )
                finally:
                    await session.close()
    finally:
        await engine.dispose()


async def test_concurrent_grant_yields_one_row_and_one_truthy_return(
    integration_env, seeded_user_and_achievement
):
    user_id = seeded_user_and_achievement["user_id"]
    code = seeded_user_and_achievement["achievement_code"]

    outcomes = await asyncio.gather(
        _grant_in_own_tx(
            integration_env["DATABASE_URL"],
            user_id=user_id,
            achievement_code=code,
        ),
        _grant_in_own_tx(
            integration_env["DATABASE_URL"],
            user_id=user_id,
            achievement_code=code,
        ),
    )

    # Exactly one caller actually inserted; the other saw the conflict.
    assert sorted(outcomes) == [False, True]

    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    try:
        async with engine.connect() as conn:
            count = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM user_achievements WHERE "
                        "user_id = :uid AND achievement_code = :code"
                    ),
                    {"uid": user_id, "code": code},
                )
            ).scalar_one()
            assert count == 1
    finally:
        await engine.dispose()
