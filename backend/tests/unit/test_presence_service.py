from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.domain.models import User
from app.domain.repositories.presence import (
    IPresenceTracker,
    PresenceEntry,
    PresenceState,
)
from app.domain.repositories.user_repo import IUserRepo, UserCredentials
from app.domain.services.presence_service import (
    STREET_CHANNEL,
    PresenceService,
    StreetUser,
)


class InMemoryPresenceTracker(IPresenceTracker):
    def __init__(self) -> None:
        self._rows: dict[str, PresenceEntry] = {}

    async def online(
        self,
        user_id: str,
        *,
        state: PresenceState = "on_street",
        status: str = "focus",
    ) -> None:
        self._rows[user_id] = PresenceEntry(
            user_id=user_id, state=state, status=status, last_seen_at=datetime.now(UTC)
        )

    async def offline(self, user_id: str) -> None:
        self._rows.pop(user_id, None)

    async def update(
        self,
        user_id: str,
        *,
        state: PresenceState | None = None,
        status: str | None = None,
    ) -> None:
        prev = self._rows.get(user_id)
        if prev is None:
            return
        self._rows[user_id] = PresenceEntry(
            user_id=user_id,
            state=state or prev.state,
            status=status or prev.status,
            last_seen_at=datetime.now(UTC),
        )

    async def get(self, user_id: str) -> PresenceEntry | None:
        return self._rows.get(user_id)

    async def list(
        self, *, state: PresenceState | None = None
    ) -> list[PresenceEntry]:
        rows = list(self._rows.values())
        if state is not None:
            rows = [r for r in rows if r.state == state]
        return rows


class RecordingPublisher:
    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, Any]]] = []

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
        self.published.append((channel, payload))


class FakeUserRepo(IUserRepo):
    def __init__(self, users: list[User]) -> None:
        self._by_id = {u.id: u for u in users}

    async def get_by_id(self, user_id: str) -> User | None:
        return self._by_id.get(user_id)

    async def get_credentials_by_email(self, email: str) -> UserCredentials | None:
        return None

    async def create(
        self,
        *,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
    ) -> User:
        raise NotImplementedError

    async def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None = None,
        character_key: str | None = None,
        role_label: str | None = None,
    ) -> User:
        raise NotImplementedError

    async def list_recent(self, *, limit: int) -> list[User]:
        return list(self._by_id.values())[:limit]

    async def get_many_by_ids(self, user_ids: list[str]) -> list[User]:
        return [self._by_id[uid] for uid in user_ids if uid in self._by_id]


def _make_user(user_id: str, *, character_key: str = "kai", active: bool = True) -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name=f"User {user_id}",
        character_key=character_key,
        role_label=None,
        is_active=active,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_connect_marks_online_and_broadcasts():
    tracker = InMemoryPresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)

    await svc.connect("u1")

    entry = await tracker.get("u1")
    assert entry is not None
    assert entry.state == "on_street"
    assert entry.status == "focus"

    assert pub.published == [
        (
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": "u1",
                "state": "on_street",
                "status": "focus",
            },
        )
    ]


@pytest.mark.asyncio
async def test_disconnect_removes_and_broadcasts_offline():
    tracker = InMemoryPresenceTracker()
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
    tracker = InMemoryPresenceTracker()
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
    tracker = InMemoryPresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo([_make_user("u1"), _make_user("u2")])

    await svc.connect("u1")
    await svc.connect("u2")
    await svc.set_state("u2", "in_room")

    on_street = await svc.list_street(users, cap=10)
    assert [u.id for u in on_street] == ["u1"]


@pytest.mark.asyncio
async def test_list_street_hydrates_users_and_applies_cap():
    tracker = InMemoryPresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo([_make_user(f"u{i}", character_key="kai") for i in range(5)])

    for i in range(5):
        await svc.connect(f"u{i}")

    result = await svc.list_street(users, cap=3)
    assert len(result) == 3
    assert all(isinstance(u, StreetUser) for u in result)
    assert {u.character_key for u in result} == {"kai"}


@pytest.mark.asyncio
async def test_list_street_skips_inactive_users():
    tracker = InMemoryPresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo(
        [_make_user("u1"), _make_user("u2", active=False), _make_user("u3")]
    )

    for uid in ("u1", "u2", "u3"):
        await svc.connect(uid)

    result = await svc.list_street(users, cap=10)
    assert sorted(u.id for u in result) == ["u1", "u3"]


@pytest.mark.asyncio
async def test_list_street_status_reflects_tracker_state():
    tracker = InMemoryPresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo([_make_user("u1")])

    await svc.connect("u1")
    await svc.set_status("u1", "create")
    result = await svc.list_street(users, cap=10)
    assert result[0].status == "create"


@pytest.mark.asyncio
async def test_list_street_empty_when_nobody_online():
    tracker = InMemoryPresenceTracker()
    pub = RecordingPublisher()
    svc = PresenceService(tracker, pub)
    users = FakeUserRepo([_make_user("u1")])

    result = await svc.list_street(users, cap=10)
    assert result == []
