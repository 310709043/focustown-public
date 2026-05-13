"""Seed development data: achievements, shop items.

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
from app.infrastructure.db.models.achievement import AchievementORM  # noqa: E402
from app.infrastructure.db.models.shop_item import ShopItemORM  # noqa: E402
from app.infrastructure.db.session import get_session_factory  # noqa: E402

ACHIEVEMENTS = [
    {"code": "streak_7", "icon": "🔥", "title": "連續 7 天", "description": "每天都有專注"},
    {"code": "night_owl", "icon": "🦉", "title": "深夜王者", "description": "凌晨後還在線"},
    {"code": "century", "icon": "🍅", "title": "百番茄", "description": "累計 100 個番茄"},
    {"code": "perfect_pair", "icon": "💞", "title": "完美配對", "description": "共同專注 10h"},
    {"code": "sprint_15", "icon": "⚡", "title": "衝刺之王", "description": "單日 15 個番茄"},
    {"code": "midnight_20", "icon": "🌙", "title": "夜貓族", "description": "午夜後專注 20 次"},
]

SHOP_ITEMS = [
    # cars
    {"category": "car", "icon": "🚗", "name": "霓虹跑車", "description": "紫色霓虹燈特效，限定色款", "price_cents": 4900, "featured": True},
    {"category": "car", "icon": "🚕", "name": "復古計程車", "description": "懷舊黃色像素風格", "price_cents": 3900, "featured": False},
    {"category": "car", "icon": "🏎️", "name": "F1 賽車", "description": "超速紅色，帶尾翼特效", "price_cents": 5900, "featured": False},
    {"category": "car", "icon": "🚌", "name": "星空巴士", "description": "載著整個小鎮的夢", "price_cents": 4900, "featured": False},
    # scenes
    {"category": "scene", "icon": "🌃", "name": "台灣夜市", "description": "霓虹燈、臭豆腐攤、人潮", "price_cents": 7900, "featured": True},
    {"category": "scene", "icon": "🌸", "name": "京都春季", "description": "櫻花飄落、石板路", "price_cents": 7900, "featured": False},
    {"category": "scene", "icon": "🌊", "name": "海邊日落", "description": "浪聲、橘紅天空", "price_cents": 6900, "featured": False},
    {"category": "scene", "icon": "☁️", "name": "雲端城市", "description": "在雲上面的魔法小鎮", "price_cents": 8900, "featured": False},
    # effects
    {"category": "effect", "icon": "✨", "name": "配對光環", "description": "配對成功時的星光特效", "price_cents": 3900, "featured": False},
    {"category": "effect", "icon": "🏆", "name": "大賞徽章框", "description": "大賞區專屬金框顯示", "price_cents": 2900, "featured": False},
    {"category": "effect", "icon": "🎁", "name": "禮物盒", "description": "送給你的配對對象", "price_cents": 9900, "featured": True},
    {"category": "effect", "icon": "💫", "name": "完成爆炸", "description": "番茄完成時的煙火特效", "price_cents": 4900, "featured": False},
]


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
        # shop items (don't dedupe — running twice will duplicate; gate by env)
        count_existing = (
            await db.execute(_select(ShopItemORM))
        ).scalars().all()
        if not count_existing:
            for s in SHOP_ITEMS:
                db.add(ShopItemORM(id=ids.new_id(), **s))
        await db.commit()
    print("✓ Seed complete")


def _select(model):
    from sqlalchemy import select

    return select(model)


if __name__ == "__main__":
    asyncio.run(main())
