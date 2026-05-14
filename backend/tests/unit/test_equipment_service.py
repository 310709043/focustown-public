from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

import pytest

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.domain.models import User
from app.domain.repositories.shop_repo import ShopItemRecord
from app.domain.services.equipment_service import (
    EquipmentService,
    VehicleRenderMeta,
)
from tests.unit.fakes import FakeShopRepo, FakeUserItemRepo, FakeUserRepo

# ── Fakes/fixtures ─────────────────────────────────────────────────────────


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
        users=FakeUserRepo.from_users(users),
        user_items=FakeUserItemRepo(owned=ownerships),
        shop=FakeShopRepo(items=items),
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
