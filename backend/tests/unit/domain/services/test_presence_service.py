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
    is_bot: bool = False,
    role_label: str | None = None,
) -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name=f"User {user_id}",
        character_key=character_key,
        role_label=role_label,
        is_active=active,
        equipped_vehicle_item_id=equipped_vehicle_item_id,
        equipped_avatar_item_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        is_bot=is_bot,
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
async def test_list_street_orders_real_users_before_bots_under_cap():
    """The cap trim must never silently drop a logged-in human in favour
    of a bot. The list is sorted with real users first; ``cap=N`` then
    keeps the first N entries."""
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    # 3 bots online before the real user joins → tracker order is bots-first.
    users = FakeUserRepo.from_users(
        [
            _make_user("bot-a", is_bot=True),
            _make_user("bot-b", is_bot=True),
            _make_user("bot-c", is_bot=True),
            _make_user("real-1"),
        ]
    )

    for uid in ("bot-a", "bot-b", "bot-c", "real-1"):
        await svc.connect(uid)

    result = await svc.list_street(users, FakeShopRepo(), cap=2)

    # Despite the 2-slot cap and bots arriving first, the real user must
    # appear (sorted ahead of bots). The other slot goes to the oldest bot.
    assert result[0].id == "real-1"
    assert result[0].is_bot is False
    assert result[1].is_bot is True


@pytest.mark.asyncio
async def test_list_street_passes_role_label_as_activity():
    """The third dot-segment of the head label comes from User.role_label —
    same code path for bots (seeded role) and real users (set on profile).
    Real users without a role_label round-trip as activity=None so the
    frontend can hide the third segment."""
    tracker = FakePresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo.from_users(
        [
            _make_user("bot-a", is_bot=True, role_label="UI 設計師"),
            _make_user("real-1", role_label=None),
        ]
    )

    await svc.connect("bot-a")
    await svc.connect("real-1")

    result = await svc.list_street(users, FakeShopRepo(), cap=10)
    by_id = {u.id: u for u in result}

    assert by_id["bot-a"].activity == "UI 設計師"
    assert by_id["real-1"].activity is None


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
