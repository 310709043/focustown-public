from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.core.sentinels import UnsetType
from app.domain.models import User
from app.domain.models.room import Room, RoomVisibility
from app.domain.repositories.room_repo import IRoomRepo, RoomAlreadyExistsError
from app.domain.repositories.user_repo import IUserRepo
from app.domain.services.room_service import RoomService

# ── Fakes ───────────────────────────────────────────────────────────────────


class FakeUserRepo(IUserRepo):
    def __init__(self, users: list[User]) -> None:
        self._by_id = {u.id: u for u in users}

    async def get_by_id(self, user_id: str) -> User | None:
        return self._by_id.get(user_id)

    async def get_by_email(self, email: str) -> User | None:
        return None

    async def get_credentials_by_email(self, email: str):
        return None

    async def create(self, **kwargs) -> User:
        raise NotImplementedError

    async def update_profile(self, **kwargs) -> User:
        raise NotImplementedError

    async def update_password_hash(self, *, user_id: str, password_hash: str) -> None:
        raise NotImplementedError

    async def list_recent(self, *, limit: int) -> list[User]:
        return list(self._by_id.values())[:limit]

    async def get_many_by_ids(self, user_ids: list[str]) -> list[User]:
        return [self._by_id[u] for u in user_ids if u in self._by_id]

    async def update_equipment(self, **kwargs) -> User:
        raise NotImplementedError


class FakeRoomRepo(IRoomRepo):
    """In-memory IRoomRepo. ``raise_on_create_for`` lets a test simulate the
    concurrent lazy-create race: the first ``create`` for that owner will
    raise ``RoomAlreadyExistsError`` even though no row exists, mirroring
    what the SQL impl does when a parallel transaction wins the UNIQUE
    constraint."""

    def __init__(self) -> None:
        self.rows: dict[str, Room] = {}
        self.raise_on_create_for: set[str] = set()
        # After the simulated race fires, another row should appear so
        # ``service`` can re-read. ``preseed_after_race`` simulates that.
        self.preseed_after_race: dict[str, Room] = {}

    async def get_by_owner(self, owner_user_id: str) -> Room | None:
        for r in self.rows.values():
            if r.owner_user_id == owner_user_id:
                return r
        return None

    async def get_by_id(self, room_id: str) -> Room | None:
        return self.rows.get(room_id)

    async def create(
        self,
        *,
        room_id: str,
        owner_user_id: str,
        name: str,
        theme: str,
        visibility: RoomVisibility = "public",
        max_visitors: int = 5,
    ) -> Room:
        if owner_user_id in self.raise_on_create_for:
            self.raise_on_create_for.discard(owner_user_id)
            if owner_user_id in self.preseed_after_race:
                pre = self.preseed_after_race.pop(owner_user_id)
                self.rows[pre.id] = pre
            raise RoomAlreadyExistsError("uq_rooms_owner_user_id")
        # Honor the UNIQUE in fake form so we can also assert it on the
        # non-simulated path.
        if any(r.owner_user_id == owner_user_id for r in self.rows.values()):
            raise RoomAlreadyExistsError("uq_rooms_owner_user_id")
        now = datetime.now(UTC)
        room = Room(
            id=room_id,
            owner_user_id=owner_user_id,
            name=name,
            theme=theme,
            visibility=visibility,
            max_visitors=max_visitors,
            created_at=now,
            updated_at=now,
        )
        self.rows[room_id] = room
        return room

    async def update(
        self,
        *,
        room_id: str,
        name: str | UnsetType,
        theme: str | UnsetType,
    ) -> Room:
        row = self.rows.get(room_id)
        if row is None:
            raise NotFoundError("room_not_found")
        if isinstance(name, str):
            row.name = name
        if isinstance(theme, str):
            row.theme = theme
        row.updated_at = datetime.now(UTC)
        return row


class FakeIdGen:
    def __init__(self, ids: list[str]) -> None:
        self._ids = iter(ids)

    def new_id(self) -> str:
        return next(self._ids)


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
    id_gen = FakeIdGen(ids or ["room-alice-1"])
    svc = RoomService(
        rooms=room_repo,
        users=FakeUserRepo(user_list),
        id_gen=id_gen,
    )
    return svc, room_repo, svc.users  # type: ignore[return-value]


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
async def test_get_by_id_forbidden_for_non_owner() -> None:
    users = [_make_user("u-alice", "Alice"), _make_user("u-bob", "Bob")]
    svc, _, _ = _make_service(users=users)
    alice_room = await svc.get_or_create_for_user(user_id="u-alice")
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
