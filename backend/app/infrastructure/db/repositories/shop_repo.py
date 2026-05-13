from __future__ import annotations

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
