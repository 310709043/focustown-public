from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.shop.schemas import ShopItemResponse
from app.core.deps import DbDep
from app.infrastructure.db.repositories import SqlShopRepo

router = APIRouter()


@router.get("", response_model=list[ShopItemResponse])
async def list_items(db: DbDep, category: str | None = None) -> list[ShopItemResponse]:
    repo = SqlShopRepo(db)
    items = (
        await repo.list_by_category(category) if category else await repo.list_all()
    )
    return [ShopItemResponse(**i.__dict__) for i in items]
