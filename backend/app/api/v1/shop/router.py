from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.shop.schemas import (
    PurchaseRequest,
    PurchaseResponse,
    ShopItemPriceResponse,
    ShopItemResponse,
)
from app.core.deps import (
    ClockDep,
    CurrentUserId,
    DbDep,
    IdGenDep,
    RealtimePublisherDep,
)
from app.domain.repositories.shop_repo import ShopItemRecord
from app.domain.services.purchase_service import PurchaseService
from app.domain.services.wallet_service import WalletService
from app.infrastructure.db.repositories import (
    SqlShopItemPriceRepo,
    SqlShopRepo,
    SqlUserItemRepo,
    SqlWalletRepo,
    SqlWalletTransactionRepo,
)

router = APIRouter()


def _item_to_response(
    item: ShopItemRecord,
    prices: list[ShopItemPriceResponse],
) -> ShopItemResponse:
    # Explicit field-by-field mapping so internal-only ShopItemRecord
    # fields (e.g. `render_meta`) cannot leak into the wire shape.
    return ShopItemResponse(
        id=item.id,
        category=item.category,
        icon=item.icon,
        name=item.name,
        description=item.description,
        price_cents=item.price_cents,
        featured=item.featured,
        prices=prices,
    )


@router.get("", response_model=list[ShopItemResponse])
async def list_items(
    db: DbDep, category: str | None = None
) -> list[ShopItemResponse]:
    repo = SqlShopRepo(db)
    prices_repo = SqlShopItemPriceRepo(db)
    items = (
        await repo.list_by_category(category) if category else await repo.list_all()
    )
    price_map = await prices_repo.list_for_items([i.id for i in items])
    return [
        _item_to_response(
            i,
            [
                ShopItemPriceResponse(
                    currency_code=p.currency_code,
                    amount_minor=p.amount_minor,
                )
                for p in price_map.get(i.id, [])
            ],
        )
        for i in items
    ]


@router.post(
    "/items/{item_id}/purchase",
    response_model=PurchaseResponse,
    status_code=201,
)
async def purchase_item(
    item_id: str,
    payload: PurchaseRequest,
    user_id: CurrentUserId,
    db: DbDep,
    clock: ClockDep,
    ids: IdGenDep,
    publisher: RealtimePublisherDep,
) -> PurchaseResponse:
    wallet_service = WalletService(
        wallets=SqlWalletRepo(db),
        transactions=SqlWalletTransactionRepo(db),
        publisher=publisher,
        ids=ids,
        clock=clock,
    )
    svc = PurchaseService(
        shop=SqlShopRepo(db),
        prices=SqlShopItemPriceRepo(db),
        user_items=SqlUserItemRepo(db),
        wallet_service=wallet_service,
        ids=ids,
    )
    result = await svc.purchase(
        user_id=user_id,
        shop_item_id=item_id,
        currency_code=payload.currency_code,
    )
    return PurchaseResponse(
        item_id=result.item.id,
        transaction_id=result.transaction.id,
        currency_code=result.transaction.currency_code,
        new_balance_minor=result.new_balance_minor,
        delta_minor=result.transaction.delta_minor,
        acquired_at=result.transaction.created_at,
    )
