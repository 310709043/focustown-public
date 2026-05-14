from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.shop_repo import IShopRepo, ShopItemRecord
from app.infrastructure.db.models.shop_item import ShopItemORM


def _to_record(row: ShopItemORM) -> ShopItemRecord:
    return ShopItemRecord(
        id=row.id,
        category=row.category,
        icon=row.icon,
        name=row.name,
        description=row.description,
        price_cents=row.price_cents,
        featured=row.featured,
        render_meta=row.render_meta,
    )


class SqlShopRepo(IShopRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_all(self) -> list[ShopItemRecord]:
        stmt = select(ShopItemORM).order_by(
            ShopItemORM.category, ShopItemORM.featured.desc(), ShopItemORM.name
        )
        return [_to_record(r) for r in (await self._s.execute(stmt)).scalars().all()]

    async def list_by_category(self, category: str) -> list[ShopItemRecord]:
        stmt = (
            select(ShopItemORM)
            .where(ShopItemORM.category == category)
            .order_by(ShopItemORM.featured.desc(), ShopItemORM.name)
        )
        return [_to_record(r) for r in (await self._s.execute(stmt)).scalars().all()]

    async def get_by_id(self, item_id: str) -> ShopItemRecord | None:
        row = await self._s.get(ShopItemORM, item_id)
        return _to_record(row) if row else None

    async def get_render_metas(
        self, item_ids: list[str]
    ) -> dict[str, dict[str, Any] | None]:
        if not item_ids:
            return {}
        stmt = select(ShopItemORM.id, ShopItemORM.render_meta).where(
            ShopItemORM.id.in_(item_ids)
        )
        rows = (await self._s.execute(stmt)).all()
        return {row.id: row.render_meta for row in rows}
