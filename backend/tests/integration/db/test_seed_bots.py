"""Integration test for ``scripts/seed-dev-data.py:_seed_bots``.

Worth testing:
- First run creates exactly 7 bot users with the expected character keys
  (``luna``, ``kai``, ``milo``, ``aria``, ``zoe``, ``rex``, ``nyx``).
- Each bot ends up with ``BOT_SESSION_COUNT`` (20) completed FocusSession
  rows in the past 7 days — the matching strategy's Jaccard window relies
  on this.
- Re-running is idempotent on users (the second pass does not duplicate
  rows) AND re-seeds focus history (no compounding 20→40→60 sessions).
"""
from __future__ import annotations

import importlib.util
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy import func, select

from app.core.ids import UUID4Generator
from app.infrastructure.db.models.focus_session import FocusSessionORM
from app.infrastructure.db.models.user import UserORM


def _load_seed_module() -> ModuleType:
    """Load ``scripts/seed-dev-data.py`` by path — the hyphen in the
    filename makes a normal ``import`` impossible."""
    script_path = (
        Path(__file__).resolve().parents[4] / "scripts" / "seed-dev-data.py"
    )
    spec = importlib.util.spec_from_file_location("_seed_module", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SEED = _load_seed_module()


async def _count_bots(db_session) -> int:
    stmt = select(func.count()).select_from(UserORM).where(UserORM.is_bot.is_(True))
    return int((await db_session.execute(stmt)).scalar_one())


async def _count_sessions_for_bots(db_session) -> int:
    stmt = (
        select(func.count())
        .select_from(FocusSessionORM)
        .join(UserORM, UserORM.id == FocusSessionORM.user_id)
        .where(UserORM.is_bot.is_(True))
    )
    return int((await db_session.execute(stmt)).scalar_one())


@pytest.mark.asyncio
async def test_seed_bots_creates_seven_bots_with_focus_history(db_session) -> None:
    await SEED._seed_bots(db_session, UUID4Generator())
    await db_session.flush()

    assert await _count_bots(db_session) == len(SEED.BOTS)
    assert await _count_sessions_for_bots(db_session) == len(SEED.BOTS) * SEED.BOT_SESSION_COUNT

    keys = (
        await db_session.execute(
            select(UserORM.character_key).where(UserORM.is_bot.is_(True))
        )
    ).scalars().all()
    assert set(keys) == {spec["key"] for spec in SEED.BOTS}


@pytest.mark.asyncio
async def test_seed_bots_is_idempotent_on_users_and_resets_history(db_session) -> None:
    ids = UUID4Generator()
    await SEED._seed_bots(db_session, ids)
    await db_session.flush()
    user_count_after_first = await _count_bots(db_session)
    session_count_after_first = await _count_sessions_for_bots(db_session)

    await SEED._seed_bots(db_session, ids)
    await db_session.flush()

    assert await _count_bots(db_session) == user_count_after_first  # no duplicate users
    # History is re-seeded, not compounded — second run must equal first.
    assert await _count_sessions_for_bots(db_session) == session_count_after_first


@pytest.mark.asyncio
async def test_seed_bots_focus_history_lands_in_seven_day_window(db_session) -> None:
    """Without a sliding window guarantee, SimpleOverlapStrategy's 7-day
    Jaccard would decay to 0 once seeded history rolls past the cutoff.
    """
    await SEED._seed_bots(db_session, UUID4Generator())
    await db_session.flush()

    now = datetime.now(UTC)
    horizon = now - timedelta(days=7, hours=1)
    rows = (
        await db_session.execute(
            select(FocusSessionORM.started_at)
            .join(UserORM, UserORM.id == FocusSessionORM.user_id)
            .where(UserORM.is_bot.is_(True))
        )
    ).scalars().all()
    assert rows  # sanity
    assert all(started_at >= horizon for started_at in rows)
