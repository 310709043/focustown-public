from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.domain.models import User
from app.domain.models.room import Room
from app.domain.services.room_service import RoomService
from tests.unit.fakes import FakeIdGen, FakeRoomRepo, FakeUserRepo

# ── Fixtures ────────────────────────────────────────────────────────────────


def _make_user(user_id: str = "u-alice", display_name: str = "Alice") -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name=display_name,
        character_key=None,
        role_label=None,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _make_service(
    *,
    users: list[User] | None = None,
    rooms: FakeRoomRepo | None = None,
    ids: list[str] | None = None,
) -> tuple[RoomService, FakeRoomRepo, FakeUserRepo]:
    user_list = users or [_make_user()]
    room_repo = rooms or FakeRoomRepo()
    id_gen = FakeIdGen(seq=iter(ids or ["room-alice-1"]))
    user_repo = FakeUserRepo.from_users(user_list)
    svc = RoomService(
        rooms=room_repo,
        users=user_repo,
        id_gen=id_gen,
    )
    return svc, room_repo, user_repo


# ── Tests ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_or_create_first_time_creates_default_room() -> None:
    svc, rooms, _ = _make_service()
    room = await svc.get_or_create_for_user(user_id="u-alice")
    assert room.id == "room-alice-1"
    assert room.owner_user_id == "u-alice"
    assert room.name == "Alice 的房間"
    assert room.theme == "night"
    assert room.visibility == "public"
    assert room.max_visitors == 5
    assert len(rooms.rows) == 1


@pytest.mark.asyncio
async def test_get_or_create_is_idempotent() -> None:
    svc, rooms, _ = _make_service()
    first = await svc.get_or_create_for_user(user_id="u-alice")
    second = await svc.get_or_create_for_user(user_id="u-alice")
    assert first.id == second.id
    assert len(rooms.rows) == 1


@pytest.mark.asyncio
async def test_get_or_create_unknown_user_raises() -> None:
    svc, _, _ = _make_service(users=[])
    with pytest.raises(NotFoundError) as exc:
        await svc.get_or_create_for_user(user_id="u-ghost")
    assert "user_not_found" in str(exc.value)


@pytest.mark.asyncio
async def test_get_or_create_concurrent_race_returns_winning_row() -> None:
    rooms = FakeRoomRepo()
    # Simulate the race: another request already inserted this row before
    # ours flushes. Our ``create`` will raise; service must re-read.
    other_winner = Room(
        id="room-winner",
        owner_user_id="u-alice",
        name="Alice 的房間",
        theme="night",
        visibility="public",
        max_visitors=5,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    rooms.raise_on_create_for.add("u-alice")
    rooms.preseed_after_race["u-alice"] = other_winner

    svc, _, _ = _make_service(rooms=rooms)
    room = await svc.get_or_create_for_user(user_id="u-alice")
    assert room.id == "room-winner"


@pytest.mark.asyncio
async def test_update_rejects_empty_name() -> None:
    svc, _, _ = _make_service()
    await svc.get_or_create_for_user(user_id="u-alice")
    with pytest.raises(BusinessError) as exc:
        await svc.update(user_id="u-alice", name="   ")
    assert "invalid_room_name" in str(exc.value)


@pytest.mark.asyncio
async def test_update_rejects_overlong_name() -> None:
    svc, _, _ = _make_service()
    await svc.get_or_create_for_user(user_id="u-alice")
    with pytest.raises(BusinessError):
        await svc.update(user_id="u-alice", name="x" * 65)


@pytest.mark.asyncio
async def test_update_rejects_unknown_theme() -> None:
    svc, _, _ = _make_service()
    await svc.get_or_create_for_user(user_id="u-alice")
    with pytest.raises(BusinessError) as exc:
        await svc.update(user_id="u-alice", theme="cafe")
    assert "invalid_room_theme" in str(exc.value)


@pytest.mark.asyncio
async def test_update_happy_path_changes_name_and_theme() -> None:
    svc, rooms, _ = _make_service()
    await svc.get_or_create_for_user(user_id="u-alice")
    updated = await svc.update(
        user_id="u-alice",
        name=" alice's library ",
        theme="dawn",
    )
    assert updated.name == "alice's library"
    assert updated.theme == "dawn"


@pytest.mark.asyncio
async def test_get_by_id_returns_public_room_to_non_owner() -> None:
    # Phase 5 widening: public rooms are readable by any authenticated user.
    users = [_make_user("u-alice", "Alice"), _make_user("u-bob", "Bob")]
    svc, _, _ = _make_service(users=users)
    alice_room = await svc.get_or_create_for_user(user_id="u-alice")
    # Default visibility is "public" — Bob can read.
    fetched = await svc.get_by_id(
        room_id=alice_room.id, requester_user_id="u-bob"
    )
    assert fetched.id == alice_room.id


@pytest.mark.asyncio
async def test_get_by_id_rejects_invite_only_for_non_owner() -> None:
    users = [_make_user("u-alice", "Alice"), _make_user("u-bob", "Bob")]
    svc, rooms, _ = _make_service(users=users)
    alice_room = await svc.get_or_create_for_user(user_id="u-alice")
    # Flip to invite_only by direct fake mutation — the service has no
    # mutator for visibility yet (Phase 5 scope), but the gate must hold.
    rooms.rows[alice_room.id].visibility = "invite_only"
    with pytest.raises(ForbiddenError) as exc:
        await svc.get_by_id(room_id=alice_room.id, requester_user_id="u-bob")
    assert "room_not_accessible" in str(exc.value)


@pytest.mark.asyncio
async def test_get_by_id_returns_room_for_owner() -> None:
    svc, _, _ = _make_service()
    alice_room = await svc.get_or_create_for_user(user_id="u-alice")
    fetched = await svc.get_by_id(
        room_id=alice_room.id, requester_user_id="u-alice"
    )
    assert fetched.id == alice_room.id


@pytest.mark.asyncio
async def test_get_by_id_not_found() -> None:
    svc, _, _ = _make_service()
    with pytest.raises(NotFoundError) as exc:
        await svc.get_by_id(
            room_id="room-does-not-exist", requester_user_id="u-alice"
        )
    assert "room_not_found" in str(exc.value)
