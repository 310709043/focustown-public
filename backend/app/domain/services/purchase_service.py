from __future__ import annotations

from dataclasses import dataclass

from app.core.exceptions import (
    ConflictError,
    IdempotencyViolationError,
    NotFoundError,
)
from app.core.ids import IIdGenerator
from app.domain.repositories.shop_item_price_repo import IShopItemPriceRepo
from app.domain.repositories.shop_repo import IShopRepo, ShopItemRecord
from app.domain.repositories.user_item_repo import IUserItemWriter
from app.domain.repositories.wallet_transaction_repo import WalletTransaction
from app.domain.services.wallet_service import WalletService


@dataclass(slots=True, frozen=True)
class PurchaseResult:
    item: ShopItemRecord
    transaction: WalletTransaction
    new_balance_minor: int


class PurchaseService:
    """Buy a shop item with one of its supported currencies.

    Atomicity is provided by the surrounding DB transaction. Steps in order:
      1. resolve item + active price in the requested currency
      2. WalletService.debit (raises InsufficientFunds; idempotent)
      3. insert into user_items (UNIQUE (user_id, shop_item_id) → 409)

    If step 3 fails (already owned), the surrounding transaction rolls back
    and the wallet stays unchanged — that's why this lives inside the
    request's DB session, not in a separate connection.
    """

    def __init__(
        self,
        *,
        shop: IShopRepo,
        prices: IShopItemPriceRepo,
        user_items: IUserItemWriter,
        wallet_service: WalletService,
        ids: IIdGenerator,
    ) -> None:
        self._shop = shop
        self._prices = prices
        self._user_items = user_items
        self._wallet = wallet_service
        self._ids = ids

    async def purchase(
        self,
        *,
        user_id: str,
        shop_item_id: str,
        currency_code: str = "T",
    ) -> PurchaseResult:
        item = await self._shop.get_by_id(shop_item_id)
        if item is None:
            raise NotFoundError("item_not_found")

        price = await self._prices.get(
            shop_item_id=shop_item_id, currency_code=currency_code
        )
        if price is None:
            raise NotFoundError("price_not_available_in_currency")

        # Debit. Two ways this can short-circuit with "already owned":
        #   1) Wallet ledger's partial unique index trips on (user, currency,
        #      reason='purchase', ref_type, ref_id) — happens when the same
        #      purchase API call is retried (e.g. double-click).
        #   2) user_items UNIQUE (user_id, shop_item_id) trips below.
        # Both translate to ConflictError; the surrounding request
        # transaction rolls back so the wallet stays unchanged either way.
        try:
            txn = await self._wallet.debit(
                user_id=user_id,
                currency_code=currency_code,
                amount_minor=price.amount_minor,
                reason="purchase",
                ref_type="shop_item",
                ref_id=shop_item_id,
            )
        except IdempotencyViolationError as exc:
            raise ConflictError("already_owned") from exc

        try:
            await self._user_items.insert(
                item_id=self._ids.new_id(),
                user_id=user_id,
                shop_item_id=shop_item_id,
                acquired_via="purchase",
                wallet_transaction_id=txn.id,
            )
        except IdempotencyViolationError as exc:
            raise ConflictError("already_owned") from exc

        return PurchaseResult(
            item=item,
            transaction=txn,
            new_balance_minor=txn.balance_after_minor,
        )
