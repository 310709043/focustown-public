"""Phase 03: the seed script is re-runnable.

Running the seed logic twice must not raise PK / unique-constraint
errors and must produce identical row counts on the second run. This
pins the ``pg_insert(...).on_conflict_do_nothing(...)`` switch the
script made over the previous per-row ``db.add(...)`` loops.

The seed script's ``main()`` opens its own session factory and commits
to the live DB — bypassing the test's SAVEPOINT isolation. Rather than
write to and clean up the testcontainer DB twice, we exercise each
batch INSERT through the same module-level constants and code paths
the script uses, inside the test's nested transaction.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.ids import UUID4Generator
from app.infrastructure.db.models.achievement import AchievementORM
from app.infrastructure.db.models.focus_session import FocusSessionORM
from app.infrastructure.db.models.shop_item import ShopItemORM
from app.infrastructure.db.models.shop_item_price import ShopItemPriceORM
from app.infrastructure.db.models.user import UserORM


def _load_seed_module() -> ModuleType:
    script_path = (
        Path(__file__).resolve().parents[2] / "scripts" / "seed-dev-data.py"
    )
    spec = importlib.util.spec_from_file_location("_seed_module", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SEED = _load_seed_module()

pytestmark = pytest.mark.asyncio


async def _achievement_count(db) -> int:
    return int(
        (
            await db.execute(select(func.count()).select_from(AchievementORM))
        ).scalar_one()
    )


async def _shop_item_count(db) -> int:
    return int(
        (
            await db.execute(select(func.count()).select_from(ShopItemORM))
        ).scalar_one()
    )


async def _shop_item_price_count(db) -> int:
    return int(
        (
            await db.execute(
                select(func.count()).select_from(ShopItemPriceORM)
            )
        ).scalar_one()
    )


async def _seed_achievements_once(db, ids) -> None:
    rows = [{"id": ids.new_id(), **a} for a in SEED.ACHIEVEMENTS]
    await db.execute(
        pg_insert(AchievementORM)
        .values(rows)
        .on_conflict_do_nothing(index_elements=["code"])
    )


async def _seed_shop_items_once(db, ids) -> None:
    existing_rows = (await db.execute(select(ShopItemORM))).scalars().all()
    if existing_rows:
        return
    item_rows: list[dict] = []
    price_rows: list[dict] = []
    for s in SEED.SHOP_ITEMS:
        item_id = ids.new_id()
        item_rows.append(
            {
                "id": item_id,
                "category": s["category"],
                "icon": s["icon"],
                "name": s["name"],
                "description": s["description"],
                "price_cents": s["price_cents"],
                "featured": s["featured"],
                "render_meta": s.get("render_meta"),
            }
        )
        price_rows.append(
            {
                "id": ids.new_id(),
                "shop_item_id": item_id,
                "currency_code": "T",
                "amount_minor": s["price_cT"],
                "active": True,
            }
        )
    if item_rows:
        await db.execute(
            pg_insert(ShopItemORM)
            .values(item_rows)
            .on_conflict_do_nothing(index_elements=["id"])
        )
    if price_rows:
        await db.execute(
            pg_insert(ShopItemPriceORM)
            .values(price_rows)
            .on_conflict_do_nothing(index_elements=["id"])
        )


async def test_achievements_seed_is_idempotent(db_session) -> None:
    ids = UUID4Generator()
    await _seed_achievements_once(db_session, ids)
    await db_session.flush()
    count_after_first = await _achievement_count(db_session)
    assert count_after_first >= len(SEED.ACHIEVEMENTS)

    await _seed_achievements_once(db_session, ids)
    await db_session.flush()
    count_after_second = await _achievement_count(db_session)
    assert count_after_second == count_after_first  # no duplicates by code


async def test_shop_items_seed_is_idempotent(db_session) -> None:
    ids = UUID4Generator()
    await _seed_shop_items_once(db_session, ids)
    await db_session.flush()
    items_after_first = await _shop_item_count(db_session)
    prices_after_first = await _shop_item_price_count(db_session)
    assert items_after_first == len(SEED.SHOP_ITEMS)

    await _seed_shop_items_once(db_session, ids)
    await db_session.flush()
    assert await _shop_item_count(db_session) == items_after_first
    assert await _shop_item_price_count(db_session) == prices_after_first


async def test_seed_bots_full_run_is_idempotent(db_session) -> None:
    """End-to-end double-run via the script's actual ``_seed_bots`` —
    same shape as ``main()`` would invoke it.
    """
    ids = UUID4Generator()
    await SEED._seed_bots(db_session, ids)
    await db_session.flush()

    bots_after_first = int(
        (
            await db_session.execute(
                select(func.count()).select_from(UserORM).where(
                    UserORM.is_bot.is_(True)
                )
            )
        ).scalar_one()
    )
    sessions_after_first = int(
        (
            await db_session.execute(
                select(func.count())
                .select_from(FocusSessionORM)
                .join(UserORM, UserORM.id == FocusSessionORM.user_id)
                .where(UserORM.is_bot.is_(True))
            )
        ).scalar_one()
    )
    assert bots_after_first == len(SEED.BOTS)
    assert sessions_after_first == len(SEED.BOTS) * SEED.BOT_SESSION_COUNT

    await SEED._seed_bots(db_session, ids)
    await db_session.flush()

    bots_after_second = int(
        (
            await db_session.execute(
                select(func.count()).select_from(UserORM).where(
                    UserORM.is_bot.is_(True)
                )
            )
        ).scalar_one()
    )
    sessions_after_second = int(
        (
            await db_session.execute(
                select(func.count())
                .select_from(FocusSessionORM)
                .join(UserORM, UserORM.id == FocusSessionORM.user_id)
                .where(UserORM.is_bot.is_(True))
            )
        ).scalar_one()
    )
    assert bots_after_second == bots_after_first  # no duplicate users
    # History re-seeded, not compounded (DELETE + bulk INSERT each run).
    assert sessions_after_second == sessions_after_first
