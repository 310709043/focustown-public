from __future__ import annotations

from dataclasses import asdict

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
    # ShopItemRecord is a slots=True dataclass → no __dict__; use asdict().
    return [ShopItemResponse(**asdict(i)) for i in items]
