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

# Make `app.*` importable in both layouts:
# - From repo root: <repo>/backend/app/ ← add <repo>/backend
# - From inside the backend container: /app/app/... ← /app is already cwd,
#   but PYTHONPATH may not include it, so add it explicitly
ROOT = Path(__file__).resolve().parents[1]
for candidate in (ROOT / "backend", Path("/app")):
    if (candidate / "app" / "core" / "config.py").exists():
        sys.path.insert(0, str(candidate))
        break

from app.core.config import get_settings  # noqa: E402
from app.core.ids import UUID4Generator  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.infrastructure.db.models.achievement import AchievementORM  # noqa: E402
from app.infrastructure.db.models.shop_item import ShopItemORM  # noqa: E402
from app.infrastructure.db.models.shop_item_price import ShopItemPriceORM  # noqa: E402
from app.infrastructure.db.models.track import TrackORM  # noqa: E402
from app.infrastructure.db.models.user import UserORM  # noqa: E402
from app.infrastructure.db.session import get_session_factory  # noqa: E402
from app.infrastructure.storage.local import LocalFSStorage  # noqa: E402

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

# Phase 6 Tier-2 — track library seeds.
#
# Real audio data isn't shipped in git. Drop any royalty-free MP3 file at
# backend/assets/seed-tracks/<name>.mp3 to enable seeding; the script picks
# them up by filename and seeds rows with default mood lofi (override via the
# inline mapping below). If the directory is empty, track seeding is skipped
# silently. Users can also upload via /town/library once registered.
SEED_TRACK_MOOD_BY_FILENAME: dict[str, dict[str, str]] = {
    # filename -> overrides; everything else defaults to lofi / artist None.
    "midnight-city-lofi.mp3": {"title": "Midnight City — Lofi", "mood": "lofi"},
    "tokyo-rain.mp3": {"title": "Tokyo Rain", "mood": "rain"},
    "late-night-drive.mp3": {"title": "Late Night Drive", "mood": "jazz"},
}

SEED_SYSTEM_USER_EMAIL = "seed-system@focustown.local"


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

        await _seed_tracks(db, settings, ids)

        await db.commit()
    print("✓ Seed complete")


async def _seed_tracks(db, settings, ids) -> None:
    """Phase 6 Tier-2: copy any MP3 files found in backend/assets/seed-tracks/
    into storage_root and insert tracks rows owned by a system seed user.
    Idempotent — files already seeded (same filename → file_key) are skipped.
    Silently no-ops when the assets directory is empty or missing."""
    assets_dir = ROOT / "backend" / "assets" / "seed-tracks"
    if not assets_dir.exists():
        return
    mp3_files = sorted(assets_dir.glob("*.mp3"))
    if not mp3_files:
        print(f"  (track seed) no MP3s found in {assets_dir}; skipping")
        return

    # Reuse storage backend so AWS swap doesn't break the seeder.
    storage = LocalFSStorage(settings.storage_root)

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

    for path in mp3_files:
        filename = path.name
        existing = (
            await db.execute(_select(TrackORM).where(TrackORM.title == _seed_title(filename)))
        ).scalar_one_or_none()
        if existing is not None:
            continue
        data = path.read_bytes()
        track_id = ids.new_id()
        file_key = f"tracks/{track_id}.mp3"
        await storage.put(key=file_key, data=data, content_type="audio/mpeg")
        meta = SEED_TRACK_MOOD_BY_FILENAME.get(filename, {})
        db.add(
            TrackORM(
                id=track_id,
                title=meta.get("title", _seed_title(filename)),
                artist=None,
                mood=meta.get("mood", "lofi"),
                duration_ms=None,
                file_key=file_key,
                content_type="audio/mpeg",
                file_size_bytes=len(data),
                license="royalty-free-seed",
                uploaded_by_user_id=system_user.id,
            )
        )


def _seed_title(filename: str) -> str:
    return filename[:-4].replace("-", " ").title() if filename.lower().endswith(".mp3") else filename


def _select(model):
    from sqlalchemy import select

    return select(model)


if __name__ == "__main__":
    asyncio.run(main())
