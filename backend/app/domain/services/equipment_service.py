from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.domain.models import User
from app.domain.repositories.shop_repo import IShopRepo
from app.domain.repositories.user_item_repo import IUserItemReader
from app.domain.repositories.user_repo import IUserWriter


@dataclass(slots=True, frozen=True)
class VehicleRenderMeta:
    icon: str
    body_color: str
    roof_color: str

    @classmethod
    def from_json(cls, raw: dict[str, Any] | None) -> VehicleRenderMeta | None:
        if not raw:
            return None
        try:
            return cls(
                icon=str(raw["icon"]),
                body_color=str(raw["body_color"]),
                roof_color=str(raw["roof_color"]),
            )
        except (KeyError, TypeError):
            return None


class EquipmentService:
    """Validates ownership + flips the equip pointer.

    SOLID:
    - S: only concerned with equipping; persistence is the only side effect.
      The street broadcast that follows a successful equip lives in the
      router (a transport-layer concern), not here — that keeps this
      service free of realtime knowledge and trivially testable.
    - D: depends on Protocols (`IUserWriter`, `IUserItemReader`,
      `IShopRepo`), not on adapters. The user_items side narrows to the
      Reader since equip only verifies ownership; it never inserts.
    """

    def __init__(
        self,
        *,
        users: IUserWriter,
        user_items: IUserItemReader,
        shop: IShopRepo,
    ) -> None:
        self._users = users
        self._user_items = user_items
        self._shop = shop

    async def equip_vehicle(
        self, *, user_id: str, shop_item_id: str | None
    ) -> User:
        if shop_item_id is not None:
            item = await self._shop.get_by_id(shop_item_id)
            if item is None:
                raise NotFoundError("item_not_found")
            if item.category != "car":
                raise BusinessError("item_not_a_vehicle")
            if not await self._user_items.owns(
                user_id=user_id, shop_item_id=shop_item_id
            ):
                raise ForbiddenError("item_not_owned")

        return await self._users.update_equipment(
            user_id=user_id,
            equipped_vehicle_item_id=shop_item_id,
        )

    async def resolve_vehicle(
        self, equipped_vehicle_item_id: str | None
    ) -> VehicleRenderMeta | None:
        if not equipped_vehicle_item_id:
            return None
        metas = await self._shop.get_render_metas([equipped_vehicle_item_id])
        return VehicleRenderMeta.from_json(metas.get(equipped_vehicle_item_id))
