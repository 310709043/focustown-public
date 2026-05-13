from __future__ import annotations

from pydantic import BaseModel


class ShopItemResponse(BaseModel):
    id: str
    category: str
    icon: str
    name: str
    description: str
    price_cents: int
    featured: bool
