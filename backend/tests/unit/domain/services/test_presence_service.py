from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.models import User
from app.domain.services.presence_service import (
    STREET_CHANNEL,
    PresenceService,
    StreetUser,
)
from tests.unit.fakes import (
    FakePresenceTracker,
    FakeShopRepo,
    FakeUserRepo,
    RecordingPublisher,
)


def _make_user(
    user_id: str,
    *,
    character_key: str = "kai",
    active: bool = True,
    equipped_vehicle_item_id: str | None = None,
) -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name=f"User {user_id}",
        character_key=character_key,
        role_label=None,
        is_active=active,
        equipped_vehicle_item_id=equipped_vehicle_item_id,
        equipped_avatar_item_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_connect_marks_online_and_broadcasts():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)

    await svc.connect("u1")

    entry = await tracker.get("u1")
    assert entry is not None
    assert entry.state == "on_street"
    # Default status on connect is "afk" — a fresh connection is idle until
    # SessionPresenceLink flips it to "focus" on SessionStarted.
    assert entry.status == "afk"

    assert pub.published == [
        (
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": "u1",
                "state": "on_street",
                "status": "afk",
            },
        )
    ]


@pytest.mark.asyncio
async def test_disconnect_removes_and_broadcasts_offline():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)

    await svc.connect("u1")
    pub.published.clear()
    await svc.disconnect("u1")

    assert await tracker.get("u1") is None
    assert pub.published == [
        (
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": "u1",
                "state": "offline",
            },
        )
    ]


@pytest.mark.asyncio
async def test_set_status_updates_tracker_and_broadcasts():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)

    await svc.connect("u1")
    pub.published.clear()
    await svc.set_status("u1", "break")

    entry = await tracker.get("u1")
    assert entry is not None
    assert entry.status == "break"
    assert pub.published[-1] == (
        STREET_CHANNEL,
        {"type": "presence.changed", "user_id": "u1", "status": "break"},
    )


@pytest.mark.asyncio
async def test_set_state_in_room_hides_from_street_list():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo.from_users([_make_user("u1"), _make_user("u2")])

    await svc.connect("u1")
    await svc.connect("u2")
    await svc.set_state("u2", "in_room")

    on_street = await svc.list_street(users, FakeShopRepo(), cap=10)
    assert [u.id for u in on_street] == ["u1"]


@pytest.mark.asyncio
async def test_list_street_hydrates_users_and_applies_cap():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo.from_users(
        [_make_user(f"u{i}", character_key="kai") for i in range(5)]
    )

    for i in range(5):
        await svc.connect(f"u{i}")

    result = await svc.list_street(users, FakeShopRepo(), cap=3)
    assert len(result) == 3
    assert all(isinstance(u, StreetUser) for u in result)
    assert {u.character_key for u in result} == {"kai"}


@pytest.mark.asyncio
async def test_list_street_skips_inactive_users():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo.from_users(
        [_make_user("u1"), _make_user("u2", active=False), _make_user("u3")]
    )

    for uid in ("u1", "u2", "u3"):
        await svc.connect(uid)

    result = await svc.list_street(users, FakeShopRepo(), cap=10)
    assert sorted(u.id for u in result) == ["u1", "u3"]


@pytest.mark.asyncio
async def test_list_street_status_reflects_tracker_state():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo.from_users([_make_user("u1")])

    await svc.connect("u1")
    await svc.set_status("u1", "create")
    result = await svc.list_street(users, FakeShopRepo(), cap=10)
    assert result[0].status == "create"


@pytest.mark.asyncio
async def test_list_street_empty_when_nobody_online():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo.from_users([_make_user("u1")])

    result = await svc.list_street(users, FakeShopRepo(), cap=10)
    assert result == []


@pytest.mark.asyncio
async def test_list_street_hydrates_vehicle_render_meta():
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo.from_users(
        [
            _make_user("u1", equipped_vehicle_item_id="car1"),
            _make_user("u2"),  # no vehicle equipped
        ]
    )
    shop = FakeShopRepo(
        render_metas={
            "car1": {"icon": "🚕", "body_color": "#ff0000", "roof_color": "#990000"},
        }
    )

    await svc.connect("u1")
    await svc.connect("u2")

    result = await svc.list_street(users, shop, cap=10)
    by_id = {u.id: u for u in result}

    assert by_id["u1"].vehicle is not None
    assert by_id["u1"].vehicle.icon == "🚕"
    assert by_id["u1"].vehicle.body_color == "#ff0000"
    assert by_id["u2"].vehicle is None
