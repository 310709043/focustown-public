from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ShopItemPriceResponse(BaseModel):
    currency_code: str
    amount_minor: int


class ShopItemResponse(BaseModel):
    id: str
    category: str
    icon: str
    name: str
    description: str
    price_cents: int                      # legacy field — kept for backward compat
    featured: bool
    prices: list[ShopItemPriceResponse]   # Phase 2: multi-currency prices


class PurchaseRequest(BaseModel):
    currency_code: str = "T"


class PurchaseResponse(BaseModel):
    item_id: str
    transaction_id: str
    currency_code: str
    new_balance_minor: int
    delta_minor: int
    acquired_at: datetime
