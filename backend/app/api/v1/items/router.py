from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.items.schemas import UserItemResponse
from app.core.deps import CurrentUserId, DbDep
from app.infrastructure.db.repositories import SqlUserItemRepo

router = APIRouter()


@router.get("", response_model=list[UserItemResponse])
async def list_my_items(
    user_id: CurrentUserId,
    db: DbDep,
) -> list[UserItemResponse]:
    repo = SqlUserItemRepo(db)
    items = await repo.list_for_user(user_id)
    return [
        UserItemResponse(
            id=i.id,
            shop_item_id=i.shop_item_id,
            acquired_via=i.acquired_via,
            acquired_at=i.acquired_at,
        )
        for i in items
    ]
