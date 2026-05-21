"""Seed development data: achievements, shop items + multi-currency prices.

Run inside the backend container:
    docker compose exec backend python /app/../scripts/seed-dev-data.py

Or locally with backend env vars exported:
    python scripts/seed-dev-data.py
"""

from __future__ import annotations

import asyncio
import json
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
ROOT = BACKEND_DIR.parent if (BACKEND_DIR / "assets").exists() and BACKEND_DIR.name == "backend" else BACKEND_DIR

import random  # noqa: E402
import secrets  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.ids import UUID4Generator  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.infrastructure.db.models.achievement import AchievementORM  # noqa: E402
from app.infrastructure.db.models.focus_session import FocusSessionORM  # noqa: E402
from app.infrastructure.db.models.shop_item import ShopItemORM  # noqa: E402
from app.infrastructure.db.models.shop_item_price import ShopItemPriceORM  # noqa: E402
from app.infrastructure.db.models.track import TrackORM  # noqa: E402
from app.infrastructure.db.models.user import UserORM  # noqa: E402
from app.infrastructure.db.session import get_session_factory  # noqa: E402

# Pure helpers shared with `scripts/import-r2-manifest.py` so the title /
# mood derivation logic stays in one place.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _r2_helpers import (  # noqa: E402
    MOOD_MAP_DEFAULT,
    SEED_SYSTEM_USER_EMAIL,
    derive_mood,
    derive_title,
    title_override,
)

ACHIEVEMENTS = [
    {"code": "streak_7", "icon": "🔥", "title": "連續 7 天", "description": "每天都有專注"},
    {"code": "night_owl", "icon": "🦉", "title": "深夜王者", "description": "凌晨後還在線"},
    {"code": "century", "icon": "🍅", "title": "百番茄", "description": "累計 100 個番茄"},
    {"code": "perfect_pair", "icon": "💞", "title": "完美配對", "description": "共同專注 10h"},
    {"code": "sprint_15", "icon": "⚡", "title": "衝刺之王", "description": "單日 15 個番茄"},
    {"code": "midnight_20", "icon": "🌙", "title": "夜貓族", "description": "午夜後專注 20 次"},
]

# Phase 2 economy: prices are denominated in T (Town Coin), expressed as
# centiT (cT) = the integer "minor" unit. 100 cT = 1 T. 1 T is earned per
# 30 minutes of focused work, so 50 cT (0.5 T) is one 15-minute Pomodoro.
SHOP_ITEMS = [
    # cars — render_meta drives the equipped-vehicle colors in CarsLane (Phase 3).
    # body / roof palettes deliberately distinct from the 30-character roster so
    # an equipped car stands out from the default character-derived colors.
    {"category": "car", "icon": "🚗", "name": "霓虹跑車", "description": "紫色霓虹燈特效，限定色款", "price_cT": 80, "price_cents": 4900, "featured": True,
     "render_meta": {"icon": "🚗", "body_color": "#a855f7", "roof_color": "#6b21a8"}},
    {"category": "car", "icon": "🚕", "name": "復古計程車", "description": "懷舊黃色像素風格", "price_cT": 50, "price_cents": 3900, "featured": False,
     "render_meta": {"icon": "🚕", "body_color": "#fbbf24", "roof_color": "#b45309"}},
    {"category": "car", "icon": "🏎️", "name": "F1 賽車", "description": "超速紅色，帶尾翼特效", "price_cT": 120, "price_cents": 5900, "featured": False,
     "render_meta": {"icon": "🏎️", "body_color": "#dc2626", "roof_color": "#7f1d1d"}},
    {"category": "car", "icon": "🚌", "name": "星空巴士", "description": "載著整個小鎮的夢", "price_cT": 80, "price_cents": 4900, "featured": False,
     "render_meta": {"icon": "🚌", "body_color": "#1e3a8a", "roof_color": "#0c1d4f"}},
    # scenes
    {"category": "scene", "icon": "🌃", "name": "台灣夜市", "description": "霓虹燈、臭豆腐攤、人潮", "price_cT": 200, "price_cents": 7900, "featured": True},
    {"category": "scene", "icon": "🌸", "name": "京都春季", "description": "櫻花飄落、石板路", "price_cT": 200, "price_cents": 7900, "featured": False},
    {"category": "scene", "icon": "🌊", "name": "海邊日落", "description": "浪聲、橘紅天空", "price_cT": 150, "price_cents": 6900, "featured": False},
    {"category": "scene", "icon": "☁️", "name": "雲端城市", "description": "在雲上面的魔法小鎮", "price_cT": 300, "price_cents": 8900, "featured": False},
    # effects
    {"category": "effect", "icon": "✨", "name": "配對光環", "description": "配對成功時的星光特效", "price_cT": 40, "price_cents": 3900, "featured": False},
    {"category": "effect", "icon": "🏆", "name": "大賞徽章框", "description": "大賞區專屬金框顯示", "price_cT": 30, "price_cents": 2900, "featured": False},
    {"category": "effect", "icon": "🎁", "name": "禮物盒", "description": "送給你的配對對象", "price_cT": 250, "price_cents": 9900, "featured": True},
    {"category": "effect", "icon": "💫", "name": "完成爆炸", "description": "番茄完成時的煙火特效", "price_cT": 80, "price_cents": 4900, "featured": False},
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
    {"key": "rex",   "name": "Rex",   "role": "攝影師",     "hours": [0, 1, 2, 3, 4]},
    {"key": "nyx",   "name": "Nyx",   "role": "哲學家",     "hours": [8, 12, 16, 20, 0]},
]

BOT_SESSION_COUNT = 20
BOT_EMAIL_FMT = "bot-{key}@bots.lowbatterytown.local"


async def main() -> None:
    settings = get_settings()
    factory = get_session_factory(settings.database_url)
    ids = UUID4Generator()

    async with factory() as db:
        # achievements (upsert by code)
        for a in ACHIEVEMENTS:
            existing = await db.execute(
                _select(AchievementORM).where(AchievementORM.code == a["code"])
            )
            if existing.scalar_one_or_none() is None:
                db.add(AchievementORM(id=ids.new_id(), **a))

        # Shop items + prices: only seed on first run (idempotent by row count).
        existing_rows = (await db.execute(_select(ShopItemORM))).scalars().all()
        if not existing_rows:
            for s in SHOP_ITEMS:
                item_id = ids.new_id()
                db.add(
                    ShopItemORM(
                        id=item_id,
                        category=s["category"],
                        icon=s["icon"],
                        name=s["name"],
                        description=s["description"],
                        price_cents=s["price_cents"],
                        featured=s["featured"],
                        render_meta=s.get("render_meta"),
                    )
                )
                # T price: every catalog item is purchasable with T coins.
                db.add(
                    ShopItemPriceORM(
                        id=ids.new_id(),
                        shop_item_id=item_id,
                        currency_code="T",
                        amount_minor=s["price_cT"],
                        active=True,
                    )
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

        await _import_r2_track_catalog(db, ids)
        await _seed_bots(db, ids)

        await db.commit()
    print("✓ Seed complete")


async def _seed_bots(db, ids) -> None:
    """Seed 7 NPC users + per-bot 7-day focus history.

    User rows are idempotent (skip if email exists). FocusSession rows
    are **re-seeded every run** so the sliding 7-day window the matching
    strategy uses always contains data — without this, the rows would
    decay out of the window after one week and overlap collapses to 0.
    """
    rng = random.Random("lowbatterytown-bots-stable")
    now = datetime.now(UTC)
    seeded = 0
    for spec in BOTS:
        email = BOT_EMAIL_FMT.format(key=spec["key"])
        bot = (
            await db.execute(_select(UserORM).where(UserORM.email == email))
        ).scalar_one_or_none()
        if bot is None:
            bot = UserORM(
                id=ids.new_id(),
                email=email,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                display_name=spec["name"],
                character_key=spec["key"],
                role_label=spec["role"],
                is_active=True,
                is_bot=True,
                terms_accepted_at=now,
                terms_version="v1",
            )
            db.add(bot)
            await db.flush()
            seeded += 1
        # Drop stale focus history and rebuild inside the rolling 7-day
        # window so the compatibility strategy always has fresh signal.
        await db.execute(
            _delete(FocusSessionORM).where(FocusSessionORM.user_id == bot.id)
        )
        for _ in range(BOT_SESSION_COUNT):
            day_offset = rng.randint(0, 6)
            hour = rng.choice(spec["hours"])
            minute = rng.randint(0, 59)
            started_at = (now - timedelta(days=day_offset)).replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )
            duration_seconds = 1500  # one 25-min pomodoro
            db.add(
                FocusSessionORM(
                    id=ids.new_id(),
                    user_id=bot.id,
                    mode="focus",
                    duration_seconds=duration_seconds,
                    elapsed_seconds=duration_seconds,
                    status="completed",
                    started_at=started_at,
                    ended_at=started_at + timedelta(seconds=duration_seconds),
                )
            )
    await db.flush()
    print(
        f"  (bot seed) ensured {len(BOTS)} bots "
        f"({seeded} newly created), re-seeded focus history"
    )


async def _import_r2_track_catalog(db, ids) -> None:
    """Register every R2 object listed in `backend/assets/r2-manifests/*.json`
    as a playable track row.

    Replaces the legacy "upload local seed-tracks/*.mp3 to storage then
    insert" flow. Audio bytes now live in R2 (uploaded out-of-band via
    `scripts/upload-tracks-to-r2.py`) and only the metadata + R2 object
    key need to land in the DB on each container startup.

    Self-healing:
      - Inserts entries whose `file_key` doesn't already exist.
      - Removes seed-owned rows whose `file_key` is no longer in any
        manifest (operator removed a track → DB shrinks to match).

    Non-seed user uploads are never touched.
    """
    manifests_dir = BACKEND_DIR / "assets" / "r2-manifests"
    if not manifests_dir.exists():
        return
    manifest_files = sorted(manifests_dir.glob("*.json"))
    if not manifest_files:
        print(f"  (r2 catalog) no manifests in {manifests_dir}; skipping")
        return

    entries: list[dict] = []
    for mf in manifest_files:
        entries.extend(json.loads(mf.read_text()))
    if not entries:
        print("  (r2 catalog) manifests parsed empty; skipping")
        return

    # System user owns the catalog — created here on first run, reused
    # on every subsequent run.
    system_user = (
        await db.execute(_select(UserORM).where(UserORM.email == SEED_SYSTEM_USER_EMAIL))
    ).scalar_one_or_none()
    if system_user is None:
        system_user = UserORM(
            id=ids.new_id(),
            email=SEED_SYSTEM_USER_EMAIL,
            password_hash=hash_password("seed-system-no-login-3xpq8w"),
            display_name="Focus Town Seed",
            is_active=False,
        )
        db.add(system_user)
        await db.flush()

    desired_keys = {e["key"] for e in entries}
    # Prune scope = every is_official row whose file_key is not in the
    # current manifest set. Using is_official (not owner) catches stale
    # rows seeded by an earlier system user — observed on 2026-05-21
    # where a prior deploy left 5 ghost rows owned by a different UUID
    # for the same email after a re-deploy, so owner-scoped pruning
    # silently kept them attached to dead file_keys.
    existing_rows = (
        await db.execute(
            _select(TrackORM).where(TrackORM.is_official.is_(True))
        )
    ).scalars().all()
    existing_keys = {r.file_key for r in existing_rows}

    pruned = 0
    for row in existing_rows:
        if row.file_key not in desired_keys:
            await db.delete(row)
            pruned += 1

    # Insert new entries (idempotent by file_key unique constraint).
    inserted = 0
    for entry in entries:
        if entry["key"] in existing_keys:
            continue
        filename = entry.get("filename") or entry["key"].rsplit("/", 1)[-1]
        title = title_override(filename, MOOD_MAP_DEFAULT) or derive_title(filename)
        mood = derive_mood(filename, MOOD_MAP_DEFAULT)
        db.add(
            TrackORM(
                id=ids.new_id(),
                title=title,
                artist=None,
                mood=mood,
                duration_ms=None,  # frontend defaults to 180s on NULL
                file_key=entry["key"],
                content_type="audio/mpeg",
                file_size_bytes=int(entry["size"]),
                license="royalty-free-seed",
                uploaded_by_user_id=system_user.id,
                is_official=True,
            )
        )
        inserted += 1

    print(
        f"  (r2 catalog) {len(entries)} manifest entries; "
        f"+{inserted} inserted, -{pruned} pruned"
    )


def _select(model):
    from sqlalchemy import select

    return select(model)


def _delete(model):
    from sqlalchemy import delete

    return delete(model)


if __name__ == "__main__":
    asyncio.run(main())
