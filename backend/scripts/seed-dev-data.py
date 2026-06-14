"""Seed development data: achievements, shop items + multi-currency prices.

Run inside the backend container:
    docker compose exec backend python /app/../scripts/seed-dev-data.py

Or locally with backend env vars exported:
    python scripts/seed-dev-data.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Resolve where the backend code lives. Three possible call sites:
#   * `python backend/scripts/seed-dev-data.py`   → SCRIPT_DIR.parent = <repo>/backend
#   * `python scripts/seed-dev-data.py`           → legacy: SCRIPT_DIR.parent = <repo> (no `app/`)
#   * `python /app/scripts/seed-dev-data.py`      → LCS container: SCRIPT_DIR.parent = /app
# Walk candidates in priority order and pick the first one that holds `app/core/config.py`.
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR: Path | None = None
for candidate in (
    SCRIPT_DIR.parent,                    # backend/scripts/ or /app/scripts/
    SCRIPT_DIR.parent / "backend",        # legacy: scripts/ at repo root
    Path("/app"),                         # explicit container fallback
):
    if (candidate / "app" / "core" / "config.py").exists():
        BACKEND_DIR = candidate
        break
if BACKEND_DIR is None:
    raise RuntimeError(
        f"seed-dev-data.py could not locate backend/app from {SCRIPT_DIR}"
    )
sys.path.insert(0, str(BACKEND_DIR))
# Kept for any bot / achievement / shop seed code that still references
# `ROOT`. Resolves to the repo root in host layout and the backend dir
# in container layout — both have `assets/` underneath.
ROOT = (
    BACKEND_DIR.parent
    if (BACKEND_DIR / "assets").exists() and BACKEND_DIR.name == "backend"
    else BACKEND_DIR
)

import random  # noqa: E402
import secrets  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402

from sqlalchemy import select  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.ids import UUID4Generator  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.infrastructure.db.models.achievement import AchievementORM  # noqa: E402
from app.infrastructure.db.models.focus_session import FocusSessionORM  # noqa: E402
from app.infrastructure.db.models.shop_item import ShopItemORM  # noqa: E402
from app.infrastructure.db.models.shop_item_price import ShopItemPriceORM  # noqa: E402
from app.infrastructure.db.models.user import UserORM  # noqa: E402
from app.infrastructure.db.seed.track_catalog import (  # noqa: E402
    import_r2_track_catalog,
    load_r2_manifest_entries,
)
from app.infrastructure.db.session import get_session_factory  # noqa: E402

ACHIEVEMENTS = [
    {"code": "streak_7", "icon": "🔥", "title": "連續 7 天", "description": "每天都有專注"},
    {"code": "night_owl", "icon": "🦉", "title": "深夜王者", "description": "凌晨後還在線"},
    {"code": "century", "icon": "🔋", "title": "百番茄", "description": "累計 100 個番茄"},
    {"code": "perfect_pair", "icon": "💞", "title": "完美配對", "description": "共同專注 10h"},
    {"code": "sprint_15", "icon": "⚡", "title": "衝刺之王", "description": "單日 15 個番茄"},
    {"code": "midnight_20", "icon": "🌙", "title": "夜貓族", "description": "午夜後專注 20 次"},
]

# Phase 2 economy: prices are denominated in T (Town Coin), expressed as
# centiT (cT) = the integer "minor" unit. 100 cT = 1 T. 1 T is earned per
# 30 minutes of focused work, so 50 cT (0.5 T) is one 15-minute Pomodoro.
# Fullwidth commas in `description` strings are intentional CJK typography
# (zh-TW seed copy), so RUF001 is suppressed at the dict-literal level
# rather than per-line for readability.
SHOP_ITEMS = [
    # cars — render_meta drives the equipped-vehicle colors in CarsLane (Phase 3).
    # body / roof palettes deliberately distinct from the 30-character roster so
    # an equipped car stands out from the default character-derived colors.
    {
        "category": "car",
        "icon": "🚗",
        "name": "霓虹跑車",
        "description": "紫色霓虹燈特效，限定色款",  # noqa: RUF001
        "price_cT": 80,
        "price_cents": 4900,
        "featured": True,
        "render_meta": {"icon": "🚗", "body_color": "#a855f7", "roof_color": "#6b21a8"},
    },
    {
        "category": "car",
        "icon": "🚕",
        "name": "復古計程車",
        "description": "懷舊黃色像素風格",
        "price_cT": 50,
        "price_cents": 3900,
        "featured": False,
        "render_meta": {"icon": "🚕", "body_color": "#fbbf24", "roof_color": "#b45309"},
    },
    {
        "category": "car",
        "icon": "🏎️",
        "name": "F1 賽車",
        "description": "超速紅色，帶尾翼特效",  # noqa: RUF001
        "price_cT": 120,
        "price_cents": 5900,
        "featured": False,
        "render_meta": {"icon": "🏎️", "body_color": "#dc2626", "roof_color": "#7f1d1d"},
    },
    {
        "category": "car",
        "icon": "🚌",
        "name": "星空巴士",
        "description": "載著整個小鎮的夢",
        "price_cT": 80,
        "price_cents": 4900,
        "featured": False,
        "render_meta": {"icon": "🚌", "body_color": "#1e3a8a", "roof_color": "#0c1d4f"},
    },
    # scenes
    {
        "category": "scene",
        "icon": "🌃",
        "name": "台灣夜市",
        "description": "霓虹燈、臭豆腐攤、人潮",
        "price_cT": 200,
        "price_cents": 7900,
        "featured": True,
    },
    {
        "category": "scene",
        "icon": "🌸",
        "name": "京都春季",
        "description": "櫻花飄落、石板路",
        "price_cT": 200,
        "price_cents": 7900,
        "featured": False,
    },
    {
        "category": "scene",
        "icon": "🌊",
        "name": "海邊日落",
        "description": "浪聲、橘紅天空",
        "price_cT": 150,
        "price_cents": 6900,
        "featured": False,
    },
    {
        "category": "scene",
        "icon": "☁️",
        "name": "雲端城市",
        "description": "在雲上面的魔法小鎮",
        "price_cT": 300,
        "price_cents": 8900,
        "featured": False,
    },
    # effects
    {
        "category": "effect",
        "icon": "✨",
        "name": "配對光環",
        "description": "配對成功時的星光特效",
        "price_cT": 40,
        "price_cents": 3900,
        "featured": False,
    },
    {
        "category": "effect",
        "icon": "🏆",
        "name": "大賞徽章框",
        "description": "大賞區專屬金框顯示",
        "price_cT": 30,
        "price_cents": 2900,
        "featured": False,
    },
    {
        "category": "effect",
        "icon": "🎁",
        "name": "禮物盒",
        "description": "送給你的配對對象",
        "price_cT": 250,
        "price_cents": 9900,
        "featured": True,
    },
    {
        "category": "effect",
        "icon": "💫",
        "name": "完成爆炸",
        "description": "番茄完成時的煙火特效",
        "price_cT": 80,
        "price_cents": 4900,
        "featured": False,
    },
]

# Bot population. Each bot picks a character from the frontend roster
# (frontend/lib/data/characters.ts) and a distinct hour-of-day band so the
# SimpleOverlapStrategy's Jaccard overlap returns interesting variance per
# (real-user, bot) pair. Without per-bot bands the strategy floors to 40.
BOTS: list[dict] = [
    {"key": "luna",  "name": "Luna",  "role": "UI 設計師",  "hours": [5, 6, 7, 8, 9]},
    {"key": "kai",   "name": "Kai",   "role": "前端工程師", "hours": [11, 12, 13, 14]},
    {"key": "milo",  "name": "Milo",  "role": "小說作家",   "hours": [14, 15, 16, 17]},
    {"key": "aria",  "name": "Aria",  "role": "研究員",     "hours": [18, 19, 20]},
    {"key": "zoe",   "name": "Zoe",   "role": "音樂製作人", "hours": [21, 22, 23]},
]

BOT_SESSION_COUNT = 20
BOT_EMAIL_FMT = "bot-{key}@bots.lowbatterytown.local"


async def main() -> None:
    settings = get_settings()
    factory = get_session_factory(settings.database_url)
    ids = UUID4Generator()

    async with factory() as db:
        # Achievements — single batch INSERT keyed on the unique `code`
        # column. ON CONFLICT DO NOTHING makes re-runs no-ops at the SQL
        # level (the auto-generated id differs per run, but `code` pins
        # idempotency to the natural key).
        achievement_rows = [
            {"id": ids.new_id(), **a} for a in ACHIEVEMENTS
        ]
        await db.execute(
            pg_insert(AchievementORM)
            .values(achievement_rows)
            .on_conflict_do_nothing(index_elements=["code"])
        )

        # Shop items + prices: only seed on first run (the catalog has no
        # natural unique key on name, so we gate on row count rather than
        # ON CONFLICT). Inside the gate, build everything as one INSERT
        # per table — primary-key collisions are guarded defensively.
        existing_rows = (await db.execute(_select(ShopItemORM))).scalars().all()
        if not existing_rows:
            item_rows: list[dict] = []
            price_rows: list[dict] = []
            for s in SHOP_ITEMS:
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
                # T price: every catalog item is purchasable with T coins.
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
        else:
            # Phase 3 backfill: for previously-seeded items with no render_meta,
            # copy from SHOP_ITEMS by name. Safe to re-run; only writes when
            # the row's render_meta is currently NULL.
            by_name = {s["name"]: s for s in SHOP_ITEMS}
            for row in existing_rows:
                if row.render_meta is not None:
                    continue
                seed = by_name.get(row.name)
                if seed is None:
                    continue
                meta = seed.get("render_meta")
                if meta is not None:
                    row.render_meta = meta

        manifests_dir = BACKEND_DIR / "assets" / "r2-manifests"
        entries = load_r2_manifest_entries(manifests_dir)
        result = await import_r2_track_catalog(db, ids, entries)
        print(
            f"  (r2 catalog) {result['total']} manifest entries; "
            f"+{result['inserted']} inserted, -{result['pruned']} pruned"
        )
        await _seed_bots(db, ids)

        await db.commit()
    print("✓ Seed complete")


async def _seed_bots(db, ids) -> None:
    """Sync the bot population to the current BOTS roster.

    Three steps run every container boot:

      1. **Prune ghosts.** Any ``is_bot=true`` user whose email matches
         the bot pattern but whose key is no longer in ``BOTS`` is
         DELETEd (FKs cascade — every ``users.id`` FK in the schema is
         CASCADE or SET NULL). Without this, every roster shrink (PR
         #141's 7→5 trim removed rex/nyx; earlier rosters had more)
         left orphan bot rows in the DB; the ``refresh_bot_presence``
         worker then kept them "online" forever, inflating the ONLINE
         count and confusing dev-environment QA.
      2. **Insert missing.** New roster keys are added via
         ``ON CONFLICT DO NOTHING`` on the unique ``email`` column.
      3. **Re-seed focus history.** FocusSession rows are wiped + rebuilt
         every run so the sliding 7-day window the matching strategy
         uses always contains data — without this, the rows would
         decay out of the window after one week and overlap collapses
         to 0.
    """
    # Dev-seed PRNG, not crypto — fixed seed gives reproducible bot data.
    rng = random.Random("lowbatterytown-bots-stable")  # noqa: S311
    now = datetime.now(UTC)

    # 1. Prune ghosts. Trust the ``is_bot=true`` flag as the source of
    # truth — earlier roster generations used different email patterns
    # (we observed leftovers without the ``bot-`` prefix on the dev DB
    # after the 2026-05-22 deploy: the prior LIKE filter only caught 2
    # of 9 ghosts and the worker kept the rest "online"). Real-user
    # accounts never have ``is_bot=true`` set; if any do, that itself
    # is a data corruption signal worth surfacing — the matching seed
    # is authoritative about which bots should exist.
    expected_emails = {BOT_EMAIL_FMT.format(key=spec["key"]) for spec in BOTS}
    ghost_emails = (
        await db.execute(
            select(UserORM.email).where(
                UserORM.is_bot.is_(True),
                UserORM.email.notin_(expected_emails),
            )
        )
    ).scalars().all()
    if ghost_emails:
        await db.execute(
            _delete(UserORM).where(UserORM.email.in_(ghost_emails))
        )
        print(
            f"✓ Pruned {len(ghost_emails)} ghost bot(s): "
            f"{sorted(ghost_emails)}"
        )

    # 2. Look up any bots that already exist so we can reuse their ids
    # (instead of generating new ones that would silently fail to insert
    # via ON CONFLICT and leave us without the existing id).
    emails = [BOT_EMAIL_FMT.format(key=spec["key"]) for spec in BOTS]
    existing_rows = (
        await db.execute(
            select(UserORM.id, UserORM.email).where(UserORM.email.in_(emails))
        )
    ).all()
    existing_by_email = {row.email: row.id for row in existing_rows}

    bot_ids: dict[str, str] = {}  # email -> id (new or existing)
    new_bot_rows: list[dict] = []
    for spec in BOTS:
        email = BOT_EMAIL_FMT.format(key=spec["key"])
        if email in existing_by_email:
            bot_ids[email] = existing_by_email[email]
            continue
        bot_id = ids.new_id()
        bot_ids[email] = bot_id
        new_bot_rows.append(
            {
                "id": bot_id,
                "email": email,
                "password_hash": hash_password(secrets.token_urlsafe(32)),
                "display_name": spec["name"],
                "character_key": spec["key"],
                "role_label": spec["role"],
                "is_active": True,
                "is_bot": True,
                "terms_accepted_at": now,
                "terms_version": "v1",
            }
        )

    if new_bot_rows:
        await db.execute(
            pg_insert(UserORM)
            .values(new_bot_rows)
            .on_conflict_do_nothing(index_elements=["email"])
        )

    # Drop stale focus history for all bots in one shot, then rebuild
    # inside the rolling 7-day window so the compatibility strategy
    # always has fresh signal.
    all_bot_ids = list(bot_ids.values())
    await db.execute(
        _delete(FocusSessionORM).where(FocusSessionORM.user_id.in_(all_bot_ids))
    )
    session_rows: list[dict] = []
    duration_seconds = 1500  # one 25-min pomodoro
    for spec in BOTS:
        email = BOT_EMAIL_FMT.format(key=spec["key"])
        user_id = bot_ids[email]
        for _ in range(BOT_SESSION_COUNT):
            day_offset = rng.randint(0, 6)
            hour = rng.choice(spec["hours"])
            minute = rng.randint(0, 59)
            started_at = (now - timedelta(days=day_offset)).replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )
            session_rows.append(
                {
                    "id": ids.new_id(),
                    "user_id": user_id,
                    "mode": "focus",
                    "duration_seconds": duration_seconds,
                    "elapsed_seconds": duration_seconds,
                    "status": "completed",
                    "started_at": started_at,
                    "ended_at": started_at + timedelta(seconds=duration_seconds),
                }
            )
    if session_rows:
        await db.execute(
            pg_insert(FocusSessionORM)
            .values(session_rows)
            .on_conflict_do_nothing(index_elements=["id"])
        )

    await db.flush()
    print(
        f"  (bot seed) ensured {len(BOTS)} bots "
        f"({len(new_bot_rows)} newly created), re-seeded focus history"
    )


def _select(model):
    from sqlalchemy import select

    return select(model)


def _delete(model):
    from sqlalchemy import delete

    return delete(model)


if __name__ == "__main__":
    asyncio.run(main())
