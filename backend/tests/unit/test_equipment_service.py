from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.core.sentinels import UNSET, UnsetType
from app.domain.models import User
from app.domain.repositories.shop_repo import IShopRepo, ShopItemRecord
from app.domain.repositories.user_item_repo import IUserItemRepo
from app.domain.repositories.user_repo import IUserRepo
from app.domain.services.equipment_service import (
    EquipmentService,
    VehicleRenderMeta,
)

# ── Fakes ──────────────────────────────────────────────────────────────────

class FakeUserRepo(IUserRepo):
    def __init__(self, users: list[User]):
        self._by_id = {u.id: u for u in users}
        self.updates: list[dict[str, Any]] = []

    async def get_by_id(self, user_id):
        return self._by_id.get(user_id)

    async def get_credentials_by_email(self, email):
        return None

    async def create(self, **kwargs) -> User:
        raise NotImplementedError

    async def update_profile(self, **kwargs) -> User:
        raise NotImplementedError

    async def list_recent(self, *, limit):
        return list(self._by_id.values())[:limit]

    async def get_many_by_ids(self, user_ids):
        return [self._by_id[u] for u in user_ids if u in self._by_id]

    async def update_equipment(
        self,
        *,
        user_id,
        equipped_vehicle_item_id: str | None | UnsetType = UNSET,
        equipped_avatar_item_id: str | None | UnsetType = UNSET,
    ) -> User:
        u = self._by_id[user_id]
        self.updates.append(
            {
                "user_id": user_id,
                "vehicle": equipped_vehicle_item_id,
                "avatar": equipped_avatar_item_id,
            }
        )
        new = replace(
            u,
            equipped_vehicle_item_id=(
                u.equipped_vehicle_item_id
                if isinstance(equipped_vehicle_item_id, UnsetType)
                else equipped_vehicle_item_id
            ),
            equipped_avatar_item_id=(
                u.equipped_avatar_item_id
                if isinstance(equipped_avatar_item_id, UnsetType)
                else equipped_avatar_item_id
            ),
        )
        self._by_id[user_id] = new
        return new


class FakeUserItemRepo(IUserItemRepo):
    def __init__(self, ownerships: set[tuple[str, str]]):
        self._owned = ownerships

    async def insert(self, **kwargs):
        raise NotImplementedError

    async def list_for_user(self, user_id):
        return []

    async def owns(self, *, user_id, shop_item_id):
        return (user_id, shop_item_id) in self._owned


class FakeShopRepo(IShopRepo):
    def __init__(self, items: list[ShopItemRecord]):
        self._by_id = {i.id: i for i in items}

    async def list_all(self):
        return list(self._by_id.values())

    async def list_by_category(self, category):
        return [i for i in self._by_id.values() if i.category == category]

    async def get_by_id(self, item_id):
        return self._by_id.get(item_id)

    async def get_render_metas(self, item_ids):
        return {
            i.id: i.render_meta
            for i in self._by_id.values()
            if i.id in item_ids
        }


def _user(user_id="u1") -> User:
    return User(
        id=user_id,
        email=f"{user_id}@x.dev",
        display_name=user_id,
        character_key="kai",
        role_label=None,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _car(item_id="car1", category="car") -> ShopItemRecord:
    return ShopItemRecord(
        id=item_id,
        category=category,
        icon="🚗",
        name="Test Car",
        description="",
        price_cents=4900,
        featured=False,
        render_meta={"icon": "🚗", "body_color": "#abc123", "roof_color": "#000000"},
    )


def _make(
    users: list[User],
    items: list[ShopItemRecord],
    ownerships: set[tuple[str, str]],
) -> EquipmentService:
    return EquipmentService(
        users=FakeUserRepo(users),
        user_items=FakeUserItemRepo(ownerships),
        shop=FakeShopRepo(items),
    )


# ── Tests ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_equip_owned_vehicle_succeeds():
    svc = _make(
        users=[_user("u1")],
        items=[_car()],
        ownerships={("u1", "car1")},
    )

    user = await svc.equip_vehicle(user_id="u1", shop_item_id="car1")

    assert user.equipped_vehicle_item_id == "car1"


@pytest.mark.asyncio
async def test_unequip_with_null():
    seed = _user("u1")
    seed_owned = replace(seed, equipped_vehicle_item_id="car1")
    svc = _make(
        users=[seed_owned],
        items=[_car()],
        ownerships={("u1", "car1")},
    )

    user = await svc.equip_vehicle(user_id="u1", shop_item_id=None)

    assert user.equipped_vehicle_item_id is None


@pytest.mark.asyncio
async def test_equip_not_owned_raises_forbidden():
    svc = _make(
        users=[_user("u1")],
        items=[_car()],
        ownerships=set(),  # alice doesn't own car1
    )
    with pytest.raises(ForbiddenError, match="item_not_owned"):
        await svc.equip_vehicle(user_id="u1", shop_item_id="car1")


@pytest.mark.asyncio
async def test_equip_unknown_item_raises_not_found():
    svc = _make(
        users=[_user("u1")],
        items=[],
        ownerships=set(),
    )
    with pytest.raises(NotFoundError, match="item_not_found"):
        await svc.equip_vehicle(user_id="u1", shop_item_id="ghost")


@pytest.mark.asyncio
async def test_equip_non_car_category_raises_business():
    scene = _car(item_id="scene1", category="scene")
    svc = _make(
        users=[_user("u1")],
        items=[scene],
        ownerships={("u1", "scene1")},
    )
    with pytest.raises(BusinessError, match="item_not_a_vehicle"):
        await svc.equip_vehicle(user_id="u1", shop_item_id="scene1")


@pytest.mark.asyncio
async def test_resolve_vehicle_returns_meta_when_equipped():
    svc = _make(
        users=[_user("u1")],
        items=[_car()],
        ownerships={("u1", "car1")},
    )
    vehicle = await svc.resolve_vehicle("car1")
    assert vehicle is not None
    assert vehicle.icon == "🚗"
    assert vehicle.body_color == "#abc123"


@pytest.mark.asyncio
async def test_resolve_vehicle_none_when_unequipped():
    svc = _make(users=[_user("u1")], items=[_car()], ownerships=set())
    assert await svc.resolve_vehicle(None) is None


def test_vehicle_render_meta_from_json_tolerates_bad_shape():
    assert VehicleRenderMeta.from_json(None) is None
    assert VehicleRenderMeta.from_json({}) is None
    assert VehicleRenderMeta.from_json({"icon": "x"}) is None  # missing keys
    good = VehicleRenderMeta.from_json(
        {"icon": "🚗", "body_color": "#fff", "roof_color": "#000"}
    )
    assert good == VehicleRenderMeta(icon="🚗", body_color="#fff", roof_color="#000")
