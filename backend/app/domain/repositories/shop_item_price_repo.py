from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True, frozen=True)
class ShopItemPrice:
    id: str
    shop_item_id: str
    currency_code: str
    amount_minor: int
    active: bool


class IShopItemPriceRepo(Protocol):
    async def list_for_item(self, shop_item_id: str) -> list[ShopItemPrice]: ...

    async def list_for_items(
        self, shop_item_ids: list[str]
    ) -> dict[str, list[ShopItemPrice]]:
        """Bulk fetch for shop list view (avoids N+1)."""

    async def get(
        self, *, shop_item_id: str, currency_code: str
    ) -> ShopItemPrice | None: ...
