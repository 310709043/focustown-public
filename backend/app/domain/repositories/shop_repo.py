from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class ShopItemRecord:
    id: str
    category: str
    icon: str
    name: str
    description: str
    price_cents: int
    featured: bool


class IShopRepo(Protocol):
    async def list_all(self) -> list[ShopItemRecord]: ...
    async def list_by_category(self, category: str) -> list[ShopItemRecord]: ...
