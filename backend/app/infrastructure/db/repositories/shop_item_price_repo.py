from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.shop_item_price_repo import (
    IShopItemPriceRepo,
    ShopItemPrice,
)
from app.infrastructure.db.models.shop_item_price import ShopItemPriceORM


def _to_domain(row: ShopItemPriceORM) -> ShopItemPrice:
    return ShopItemPrice(
        id=row.id,
        shop_item_id=row.shop_item_id,
        currency_code=row.currency_code,
        amount_minor=row.amount_minor,
        active=row.active,
    )


class SqlShopItemPriceRepo(IShopItemPriceRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_for_item(self, shop_item_id: str) -> list[ShopItemPrice]:
        stmt = select(ShopItemPriceORM).where(
            ShopItemPriceORM.shop_item_id == shop_item_id,
            ShopItemPriceORM.active.is_(True),
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_for_items(
        self, shop_item_ids: list[str]
    ) -> dict[str, list[ShopItemPrice]]:
        if not shop_item_ids:
            return {}
        stmt = select(ShopItemPriceORM).where(
            ShopItemPriceORM.shop_item_id.in_(shop_item_ids),
            ShopItemPriceORM.active.is_(True),
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        out: dict[str, list[ShopItemPrice]] = defaultdict(list)
        for r in rows:
            out[r.shop_item_id].append(_to_domain(r))
        return out

    async def get(
        self, *, shop_item_id: str, currency_code: str
    ) -> ShopItemPrice | None:
        stmt = select(ShopItemPriceORM).where(
            ShopItemPriceORM.shop_item_id == shop_item_id,
            ShopItemPriceORM.currency_code == currency_code,
            ShopItemPriceORM.active.is_(True),
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None
