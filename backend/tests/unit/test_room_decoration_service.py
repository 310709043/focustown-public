from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.domain.models.room import Room
from app.domain.repositories.user_item_repo import UserItem
from app.domain.services.room_decoration_service import RoomDecorationService
from tests.unit.fakes import (
    FakeIdGen,
    FakeRoomItemRepo,
    FakeRoomRepo,
    FakeUserItemRepo,
)

# ── Fixtures ────────────────────────────────────────────────────────────────


def _seed_room(
    rooms: FakeRoomRepo,
    *,
    room_id: str = "room-alice",
    owner_user_id: str = "u-alice",
    visibility: str = "public",
) -> Room:
    now = datetime.now(UTC)
    room = Room(
        id=room_id,
        owner_user_id=owner_user_id,
        name="Alice 的房間",
        theme="night",
        visibility=visibility,  # type: ignore[arg-type]
        max_visitors=5,
        created_at=now,
        updated_at=now,
    )
    rooms.rows[room_id] = room
    return room


def _seed_user_item(
    user_items: FakeUserItemRepo,
    *,
    item_id: str = "ui-alice-lamp",
    user_id: str = "u-alice",
    shop_item_id: str = "shop-lamp",
) -> UserItem:
    row = UserItem(
        id=item_id,
        user_id=user_id,
        shop_item_id=shop_item_id,
        acquired_via="purchase",
        wallet_transaction_id=None,
        acquired_at=datetime.now(UTC),
    )
    user_items.items[item_id] = row
    user_items.owned.add((user_id, shop_item_id))
    return row


def _make_service(
    *,
    ids: list[str] | None = None,
) -> tuple[
    RoomDecorationService,
    FakeRoomRepo,
    FakeRoomItemRepo,
    FakeUserItemRepo,
]:
    rooms = FakeRoomRepo()
    room_items = FakeRoomItemRepo()
    user_items = FakeUserItemRepo()
    id_gen = FakeIdGen(seq=iter(ids or [f"ri-{i}" for i in range(1, 20)]))
    svc = RoomDecorationService(
        rooms=rooms,
        item_reader=room_items,
        item_writer=room_items,
        user_items_reader=user_items,
        id_gen=id_gen,
    )
    return svc, rooms, room_items, user_items


# ── place ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_place_creates_row_with_initial_z_index_zero() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    placed = await svc.place(
        owner_user_id="u-alice",
        user_item_id="ui-alice-lamp",
        x=50,
        y=50,
    )
    assert placed.z_index == 0


@pytest.mark.asyncio
async def test_place_assigns_next_z_index_above_existing() -> None:
    svc, rooms, room_items, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items, item_id="ui-1", shop_item_id="shop-1")
    _seed_user_item(user_items, item_id="ui-2", shop_item_id="shop-2")
    await svc.place(owner_user_id="u-alice", user_item_id="ui-1", x=10, y=10)
    second = await svc.place(
        owner_user_id="u-alice", user_item_id="ui-2", x=20, y=20
    )
    assert second.z_index == 1


@pytest.mark.asyncio
async def test_place_rejects_unknown_user_item() -> None:
    svc, rooms, _, _ = _make_service()
    _seed_room(rooms)
    with pytest.raises(BusinessError) as exc:
        await svc.place(
            owner_user_id="u-alice",
            user_item_id="ui-nothing",
            x=50,
            y=50,
        )
    assert "user_item_not_owned" in str(exc.value)


@pytest.mark.asyncio
async def test_place_rejects_item_owned_by_other_user() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items, item_id="ui-bob-lamp", user_id="u-bob")
    with pytest.raises(BusinessError) as exc:
        await svc.place(
            owner_user_id="u-alice",
            user_item_id="ui-bob-lamp",
            x=50,
            y=50,
        )
    assert "user_item_not_owned" in str(exc.value)


@pytest.mark.asyncio
async def test_place_rejects_x_out_of_range() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    with pytest.raises(BusinessError) as exc:
        await svc.place(
            owner_user_id="u-alice",
            user_item_id="ui-alice-lamp",
            x=120,
            y=50,
        )
    assert "room_item_position_out_of_range" in str(exc.value)


@pytest.mark.asyncio
async def test_place_rejects_y_out_of_range() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    with pytest.raises(BusinessError):
        await svc.place(
            owner_user_id="u-alice",
            user_item_id="ui-alice-lamp",
            x=50,
            y=-5,
        )


@pytest.mark.asyncio
async def test_place_raises_when_owner_has_no_room() -> None:
    svc, _, _, user_items = _make_service()
    _seed_user_item(user_items)
    with pytest.raises(NotFoundError) as exc:
        await svc.place(
            owner_user_id="u-alice",
            user_item_id="ui-alice-lamp",
            x=50,
            y=50,
        )
    assert "room_not_found" in str(exc.value)


# ── move ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_move_updates_position() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    placed = await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    moved = await svc.move(
        owner_user_id="u-alice", item_id=placed.id, x=75, y=30
    )
    assert (moved.x, moved.y) == (75, 30)


@pytest.mark.asyncio
async def test_move_rejects_when_not_owner_of_room() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    placed = await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    with pytest.raises(ForbiddenError) as exc:
        await svc.move(owner_user_id="u-bob", item_id=placed.id, x=50, y=50)
    assert "room_item_not_owned" in str(exc.value)


@pytest.mark.asyncio
async def test_move_rejects_x_out_of_range() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    placed = await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    with pytest.raises(BusinessError):
        await svc.move(
            owner_user_id="u-alice", item_id=placed.id, x=101, y=50
        )


@pytest.mark.asyncio
async def test_move_raises_when_item_missing() -> None:
    svc, rooms, _, _ = _make_service()
    _seed_room(rooms)
    with pytest.raises(NotFoundError) as exc:
        await svc.move(
            owner_user_id="u-alice", item_id="ri-ghost", x=10, y=10
        )
    assert "room_item_not_found" in str(exc.value)


# ── remove ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remove_deletes_row() -> None:
    svc, rooms, room_items, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    placed = await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    await svc.remove(owner_user_id="u-alice", item_id=placed.id)
    assert placed.id not in room_items.rows


@pytest.mark.asyncio
async def test_remove_rejects_when_not_owner_of_room() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms)
    _seed_user_item(user_items)
    placed = await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    with pytest.raises(ForbiddenError) as exc:
        await svc.remove(owner_user_id="u-bob", item_id=placed.id)
    assert "room_item_not_owned" in str(exc.value)


@pytest.mark.asyncio
async def test_remove_unknown_item_is_idempotent_noop() -> None:
    svc, rooms, room_items, _ = _make_service()
    _seed_room(rooms)
    # Should NOT raise — the caller can retry without us complaining.
    await svc.remove(owner_user_id="u-alice", item_id="ri-ghost")
    assert room_items.rows == {}


# ── list_for_room ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_for_room_returns_public_room_to_visitor() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms, visibility="public")
    _seed_user_item(user_items)
    await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    items = await svc.list_for_room(
        room_id="room-alice", requester_user_id="u-bob"
    )
    assert len(items) == 1


@pytest.mark.asyncio
async def test_list_for_room_rejects_invite_only_for_non_owner() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms, visibility="invite_only")
    _seed_user_item(user_items)
    await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    with pytest.raises(ForbiddenError) as exc:
        await svc.list_for_room(
            room_id="room-alice", requester_user_id="u-bob"
        )
    assert "room_not_accessible" in str(exc.value)


@pytest.mark.asyncio
async def test_list_for_room_owner_can_read_own_invite_only() -> None:
    svc, rooms, _, user_items = _make_service()
    _seed_room(rooms, visibility="invite_only")
    _seed_user_item(user_items)
    await svc.place(
        owner_user_id="u-alice", user_item_id="ui-alice-lamp", x=10, y=10
    )
    items = await svc.list_for_room(
        room_id="room-alice", requester_user_id="u-alice"
    )
    assert len(items) == 1


@pytest.mark.asyncio
async def test_list_for_room_unknown_room_raises_not_found() -> None:
    svc, _, _, _ = _make_service()
    with pytest.raises(NotFoundError) as exc:
        await svc.list_for_room(
            room_id="room-ghost", requester_user_id="u-alice"
        )
    assert "room_not_found" in str(exc.value)
