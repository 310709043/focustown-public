from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import (
    BusinessError,
    ForbiddenError,
    NotFoundError,
)
from app.domain.models.room import Room
from app.domain.services.presence_service import PresenceService
from app.domain.services.room_visit_service import RoomVisitService
from tests.unit.fakes import (
    FakeIdGen,
    FakePresenceTracker,
    FakeRoomRepo,
    FakeRoomVisitRepo,
    RecordingPublisher,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


def _seed_room(
    rooms: FakeRoomRepo,
    *,
    room_id: str = "room-alice",
    owner_user_id: str = "u-alice",
    visibility: str = "public",
    max_visitors: int = 5,
) -> Room:
    now = datetime.now(UTC)
    room = Room(
        id=room_id,
        owner_user_id=owner_user_id,
        name="Alice 的房間",
        theme="night",
        visibility=visibility,  # type: ignore[arg-type]
        max_visitors=max_visitors,
        created_at=now,
        updated_at=now,
    )
    rooms.rows[room_id] = room
    return room


def _make_service(
    *,
    ids: list[str] | None = None,
) -> tuple[
    RoomVisitService,
    FakeRoomRepo,
    FakeRoomVisitRepo,
    FakePresenceTracker,
    RecordingPublisher,
]:
    rooms = FakeRoomRepo()
    visits = FakeRoomVisitRepo()
    tracker = FakePresenceTracker()
    publisher = RecordingPublisher()
    presence = PresenceService(tracker=tracker, publisher=publisher)
    id_gen = FakeIdGen(seq=iter(ids or [f"v-{i}" for i in range(1, 20)]))
    svc = RoomVisitService(
        rooms=rooms,
        visit_reader=visits,
        visit_writer=visits,
        presence=presence,
        realtime=publisher,
        id_gen=id_gen,
    )
    return svc, rooms, visits, tracker, publisher


# ── visit ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_visit_creates_row_for_public_room() -> None:
    svc, rooms, visits, _, _ = _make_service()
    _seed_room(rooms)
    visit = await svc.visit(room_id="room-alice", user_id="u-bob")
    assert visit.room_id == "room-alice"


@pytest.mark.asyncio
async def test_visit_sets_presence_to_in_room() -> None:
    svc, rooms, _, tracker, _ = _make_service()
    _seed_room(rooms)
    # Caller must be tracked before set_state can update them.
    await tracker.online("u-bob")
    await svc.visit(room_id="room-alice", user_id="u-bob")
    entry = await tracker.get("u-bob")
    assert entry is not None and entry.state == "in_room"


@pytest.mark.asyncio
async def test_visit_publishes_room_visitor_joined() -> None:
    svc, rooms, _, _, publisher = _make_service()
    _seed_room(rooms)
    await svc.visit(room_id="room-alice", user_id="u-bob")
    joined = [
        p for (_, p) in publisher.published
        if p.get("type") == "room.visitor_joined"
    ]
    assert len(joined) == 1


@pytest.mark.asyncio
async def test_visit_rejects_invite_only_for_non_owner() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms, visibility="invite_only")
    with pytest.raises(ForbiddenError) as exc:
        await svc.visit(room_id="room-alice", user_id="u-bob")
    assert "room_not_accessible" in str(exc.value)


@pytest.mark.asyncio
async def test_visit_owner_can_enter_own_invite_only_room() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms, visibility="invite_only")
    visit = await svc.visit(room_id="room-alice", user_id="u-alice")
    assert visit.visitor_user_id == "u-alice"


@pytest.mark.asyncio
async def test_visit_rejects_when_room_full_for_non_owner() -> None:
    svc, rooms, visits, _, _ = _make_service()
    _seed_room(rooms, max_visitors=2)
    await svc.visit(room_id="room-alice", user_id="u-bob")
    await svc.visit(room_id="room-alice", user_id="u-carol")
    with pytest.raises(BusinessError) as exc:
        await svc.visit(room_id="room-alice", user_id="u-dan")
    assert "room_full" in str(exc.value)


@pytest.mark.asyncio
async def test_visit_owner_can_enter_full_own_room() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms, max_visitors=1)
    await svc.visit(room_id="room-alice", user_id="u-bob")
    # Owner enters their own room despite capacity being at the cap.
    visit = await svc.visit(room_id="room-alice", user_id="u-alice")
    assert visit.visitor_user_id == "u-alice"


@pytest.mark.asyncio
async def test_visit_auto_leaves_prior_room() -> None:
    svc, rooms, visits, _, publisher = _make_service()
    _seed_room(rooms, room_id="room-a", owner_user_id="u-alice")
    _seed_room(rooms, room_id="room-b", owner_user_id="u-bob")
    await svc.visit(room_id="room-a", user_id="u-carol")
    await svc.visit(room_id="room-b", user_id="u-carol")
    visit = await visits.get_by_user("u-carol")
    assert visit is not None and visit.room_id == "room-b"


@pytest.mark.asyncio
async def test_visit_auto_leave_publishes_left_event_to_prior_room() -> None:
    svc, rooms, _, _, publisher = _make_service()
    _seed_room(rooms, room_id="room-a", owner_user_id="u-alice")
    _seed_room(rooms, room_id="room-b", owner_user_id="u-bob")
    await svc.visit(room_id="room-a", user_id="u-carol")
    await svc.visit(room_id="room-b", user_id="u-carol")
    left_to_a = [
        (ch, p) for (ch, p) in publisher.published
        if p.get("type") == "room.visitor_left" and p.get("room_id") == "room-a"
    ]
    assert len(left_to_a) == 1


@pytest.mark.asyncio
async def test_visit_unknown_room_raises_not_found() -> None:
    svc, _, _, _, _ = _make_service()
    with pytest.raises(NotFoundError) as exc:
        await svc.visit(room_id="room-ghost", user_id="u-bob")
    assert "room_not_found" in str(exc.value)


@pytest.mark.asyncio
async def test_revisit_same_room_is_idempotent() -> None:
    svc, rooms, visits, _, _ = _make_service()
    _seed_room(rooms)
    first = await svc.visit(room_id="room-alice", user_id="u-bob")
    second = await svc.visit(room_id="room-alice", user_id="u-bob")
    assert first.id == second.id


# ── leave ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_leave_removes_visit_row() -> None:
    svc, rooms, visits, _, _ = _make_service()
    _seed_room(rooms)
    await svc.visit(room_id="room-alice", user_id="u-bob")
    await svc.leave(room_id="room-alice", user_id="u-bob")
    remaining = await visits.get_by_user("u-bob")
    assert remaining is None


@pytest.mark.asyncio
async def test_leave_sets_presence_back_to_on_street() -> None:
    svc, rooms, _, tracker, _ = _make_service()
    _seed_room(rooms)
    await tracker.online("u-bob")
    await svc.visit(room_id="room-alice", user_id="u-bob")
    await svc.leave(room_id="room-alice", user_id="u-bob")
    entry = await tracker.get("u-bob")
    assert entry is not None and entry.state == "on_street"


@pytest.mark.asyncio
async def test_leave_publishes_visitor_left_event() -> None:
    svc, rooms, _, _, publisher = _make_service()
    _seed_room(rooms)
    await svc.visit(room_id="room-alice", user_id="u-bob")
    publisher.published.clear()
    await svc.leave(room_id="room-alice", user_id="u-bob")
    left = [
        p for (_, p) in publisher.published
        if p.get("type") == "room.visitor_left"
    ]
    assert len(left) == 1


@pytest.mark.asyncio
async def test_leave_idempotent_when_not_visiting() -> None:
    svc, rooms, visits, _, _ = _make_service()
    _seed_room(rooms)
    # Should not raise — no current visit.
    await svc.leave(room_id="room-alice", user_id="u-bob")
    assert visits.rows == {}


@pytest.mark.asyncio
async def test_leave_no_op_when_visiting_different_room() -> None:
    svc, rooms, visits, _, _ = _make_service()
    _seed_room(rooms, room_id="room-a", owner_user_id="u-alice")
    _seed_room(rooms, room_id="room-b", owner_user_id="u-bob")
    await svc.visit(room_id="room-a", user_id="u-carol")
    # Caller mistakenly thinks they're in room-b — must not delete the row.
    await svc.leave(room_id="room-b", user_id="u-carol")
    still_visiting = await visits.get_by_user("u-carol")
    assert still_visiting is not None and still_visiting.room_id == "room-a"


# ── list_visitors ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_visitors_returns_public_room_to_visitor() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    await svc.visit(room_id="room-alice", user_id="u-bob")
    visitors = await svc.list_visitors(
        room_id="room-alice", requester_user_id="u-bob"
    )
    assert len(visitors) == 1


@pytest.mark.asyncio
async def test_list_visitors_rejects_invite_only_for_non_owner() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms, visibility="invite_only")
    with pytest.raises(ForbiddenError) as exc:
        await svc.list_visitors(
            room_id="room-alice", requester_user_id="u-bob"
        )
    assert "room_not_accessible" in str(exc.value)


@pytest.mark.asyncio
async def test_list_visitors_unknown_room_raises_not_found() -> None:
    svc, _, _, _, _ = _make_service()
    with pytest.raises(NotFoundError) as exc:
        await svc.list_visitors(
            room_id="room-ghost", requester_user_id="u-alice"
        )
    assert "room_not_found" in str(exc.value)
