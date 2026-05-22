from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import apply_keyset
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
        created_at=row.created_at,
    )


class SqlShopRepo(IShopRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_all(
        self,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[ShopItemRecord]:
        # Catalog originally ordered by ``(category, featured DESC, name)``.
        # Pagination requires a unique, time-stable key — we keep
        # ``(created_at DESC, id DESC)`` and let the frontend re-sort if
        # a different visual ordering is wanted.
        stmt = select(ShopItemORM)
        stmt = apply_keyset(
            stmt,
            ts_col=ShopItemORM.created_at,
            id_col=ShopItemORM.id,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            ShopItemORM.created_at.desc(), ShopItemORM.id.desc()
        ).limit(limit + 1)
        return [_to_record(r) for r in (await self._s.execute(stmt)).scalars().all()]

    async def list_by_category(
        self,
        category: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[ShopItemRecord]:
        stmt = select(ShopItemORM).where(ShopItemORM.category == category)
        stmt = apply_keyset(
            stmt,
            ts_col=ShopItemORM.created_at,
            id_col=ShopItemORM.id,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            ShopItemORM.created_at.desc(), ShopItemORM.id.desc()
        ).limit(limit + 1)
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
