from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(slots=True)
class ShopItemRecord:
    id: str
    category: str
    icon: str
    name: str
    description: str
    price_cents: int
    featured: bool
    render_meta: dict[str, Any] | None = field(default=None)


class IShopRepo(Protocol):
    async def list_all(self) -> list[ShopItemRecord]: ...
    async def list_by_category(self, category: str) -> list[ShopItemRecord]: ...
    async def get_by_id(self, item_id: str) -> ShopItemRecord | None: ...
    async def get_render_metas(
        self, item_ids: list[str]
    ) -> dict[str, dict[str, Any] | None]: ...
