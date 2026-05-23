"""Unit tests for ``FriendshipService``.

Covers: request happy path, self-request rejected, duplicate accepted,
counter-request auto-accept, accept-own-request rejected, reject pending,
unfriend accepted, list_focusing_now joins active sessions.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.clock import IClock
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.ids import IIdGenerator
from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus, User
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.friendship_repo import Friendship, IFriendshipRepo
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.services.friendship_service import (
    STATUS_ACCEPTED,
    STATUS_REQUESTED,
    FriendshipService,
)
from tests.unit.fakes import FakeUserRepo


class CounterIds(IIdGenerator):
    def __init__(self) -> None:
        self._n = itertools.count(1)

    def new_id(self) -> str:
        return f"id-{next(self._n)}"


class FrozenClock(IClock):
    def __init__(
        self, now: datetime = datetime(2026, 5, 19, 12, 0, tzinfo=UTC)
    ) -> None:
        self._now = now

    def now(self) -> datetime:  # type: ignore[override]
        return self._now


class RecordingPublisher(IRealtimePublisher):
    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, Any]]] = []

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
        self.published.append((channel, payload))


class FakeFriendshipRepo(IFriendshipRepo):
    def __init__(self) -> None:
        self.rows: dict[str, Friendship] = {}

    @staticmethod
    def _pair(a: str, b: str) -> tuple[str, str]:
        return (a, b) if a < b else (b, a)

    async def get_between(
        self, user_a_id: str, user_b_id: str
    ) -> Friendship | None:
        low, high = self._pair(user_a_id, user_b_id)
        for row in self.rows.values():
            if row.user_low_id == low and row.user_high_id == high:
                return row
        return None

    async def list_for_user(
        self,
        user_id: str,
        *,
        status: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[Friendship]:
        out = [
            r
            for r in self.rows.values()
            if user_id in (r.user_low_id, r.user_high_id)
            and (status is None or r.status == status)
        ]
        ordered = sorted(out, key=lambda r: r.created_at, reverse=True)
        return ordered[: limit + 1]

    async def list_incoming_requests(
        self,
        user_id: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[Friendship]:
        out = [
            r
            for r in self.rows.values()
            if user_id in (r.user_low_id, r.user_high_id)
            and r.status == STATUS_REQUESTED
            and r.requested_by != user_id
        ]
        return out[: limit + 1]

    async def list_accepted_friend_ids(self, user_id: str) -> list[str]:
        ids: list[str] = []
        for r in self.rows.values():
            if r.status != STATUS_ACCEPTED:
                continue
            if r.user_low_id == user_id:
                ids.append(r.user_high_id)
            elif r.user_high_id == user_id:
                ids.append(r.user_low_id)
        return ids

    async def create_request(
        self, *, friendship_id: str, requester_id: str, target_id: str
    ) -> Friendship:
        low, high = self._pair(requester_id, target_id)
        row = Friendship(
            id=friendship_id,
            user_low_id=low,
            user_high_id=high,
            status=STATUS_REQUESTED,
            requested_by=requester_id,
            created_at=datetime(2026, 5, 19, tzinfo=UTC),
            accepted_at=None,
        )
        self.rows[friendship_id] = row
        return row

    async def update_status(
        self,
        friendship_id: str,
        *,
        status: str,
        accepted_at: datetime | None = None,
    ) -> Friendship | None:
        row = self.rows.get(friendship_id)
        if row is None:
            return None
        updated = Friendship(
            id=row.id,
            user_low_id=row.user_low_id,
            user_high_id=row.user_high_id,
            status=status,
            requested_by=row.requested_by,
            created_at=row.created_at,
            accepted_at=accepted_at or row.accepted_at,
        )
        self.rows[friendship_id] = updated
        return updated

    async def delete(self, friendship_id: str) -> None:
        self.rows.pop(friendship_id, None)


class FakeFocusSessionRepo(IFocusSessionRepo):
    def __init__(self) -> None:
        self.sessions: list[FocusSession] = []

    async def create(self, **_: Any) -> FocusSession:  # type: ignore[override]
        raise NotImplementedError

    async def get(self, session_id: str) -> FocusSession | None:
        for s in self.sessions:
            if s.id == session_id:
                return s
        return None

    async def update_status(self, **_: Any) -> FocusSession | None:  # type: ignore[override]
        raise NotImplementedError

    async def list_active(self, **_: Any) -> list[FocusSession]:  # type: ignore[override]
        return [
            s
            for s in self.sessions
            if s.status == FocusSessionStatus.ACTIVE
        ]

    async def list_by_user_since(self, **_: Any) -> list[FocusSession]:  # type: ignore[override]
        return []

    async def count_completed_today(self, **_: Any) -> int:  # type: ignore[override]
        return 0

    async def daily_leaderboard(self, **_: Any) -> list[tuple[str, int]]:  # type: ignore[override]
        return []


def _user(uid: str, name: str = "n") -> User:
    return User(
        id=uid,
        email=f"{uid}@x.test",
        display_name=name,
        character_key=None,
        role_label=None,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _service(
    *, users: FakeUserRepo
) -> tuple[
    FriendshipService,
    FakeFriendshipRepo,
    FakeFocusSessionRepo,
    RecordingPublisher,
]:
    friendships = FakeFriendshipRepo()
    sessions = FakeFocusSessionRepo()
    pub = RecordingPublisher()
    svc = FriendshipService(
        friendships=friendships,
        users=users,
        focus_sessions=sessions,
        publisher=pub,
        ids=CounterIds(),
        clock=FrozenClock(),
    )
    return svc, friendships, sessions, pub


# ── tests ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_request_creates_pending_and_publishes_to_target() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, _, pub = _service(users=users)

    row = await svc.request(requester_id="alice", target_id="bob")
    assert row.status == STATUS_REQUESTED
    assert row.requested_by == "alice"
    assert (row.user_low_id, row.user_high_id) == ("alice", "bob")
    # Target receives the WS notification.
    assert pub.published[-1][0] == "user:bob"
    assert pub.published[-1][1]["type"] == "friend.requested"


@pytest.mark.asyncio
async def test_request_self_is_rejected() -> None:
    users = FakeUserRepo.from_users([_user("alice")])
    svc, *_ = _service(users=users)
    with pytest.raises(ValidationError):
        await svc.request(requester_id="alice", target_id="alice")


@pytest.mark.asyncio
async def test_request_when_already_accepted_raises_conflict() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, *_ = _service(users=users)
    await svc.request(requester_id="alice", target_id="bob")
    # Promote to accepted directly via repo to simulate prior history.
    only = next(iter(friendships.rows.values()))
    await friendships.update_status(only.id, status=STATUS_ACCEPTED)
    with pytest.raises(ConflictError):
        await svc.request(requester_id="alice", target_id="bob")


@pytest.mark.asyncio
async def test_counter_request_auto_accepts() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, *_ = _service(users=users)
    await svc.request(requester_id="alice", target_id="bob")
    # Bob sends the reverse request → service flips it to accepted.
    row = await svc.request(requester_id="bob", target_id="alice")
    assert row.status == STATUS_ACCEPTED
    assert row.accepted_at is not None


@pytest.mark.asyncio
async def test_accept_own_request_forbidden() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, *_ = _service(users=users)
    row = await svc.request(requester_id="alice", target_id="bob")
    with pytest.raises(ForbiddenError):
        await svc.accept(friendship_id=row.id, accepter_id="alice")


@pytest.mark.asyncio
async def test_accept_by_other_side_marks_accepted_and_notifies_both() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, _, pub = _service(users=users)
    row = await svc.request(requester_id="alice", target_id="bob")
    pub.published.clear()
    accepted = await svc.accept(friendship_id=row.id, accepter_id="bob")
    assert accepted.status == STATUS_ACCEPTED
    # Both users get the accepted event.
    channels = {p[0] for p in pub.published}
    assert "user:alice" in channels and "user:bob" in channels


@pytest.mark.asyncio
async def test_reject_deletes_row_and_notifies_requester() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, _, pub = _service(users=users)
    row = await svc.request(requester_id="alice", target_id="bob")
    await svc.reject(friendship_id=row.id, rejecter_id="bob")
    assert row.id not in friendships.rows
    assert pub.published[-1][0] == "user:alice"
    assert pub.published[-1][1]["type"] == "friend.rejected"


@pytest.mark.asyncio
async def test_unfriend_drops_accepted_and_notifies_other() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, _, pub = _service(users=users)
    await svc.request(requester_id="alice", target_id="bob")
    only = next(iter(friendships.rows.values()))
    await svc.accept(friendship_id=only.id, accepter_id="bob")
    pub.published.clear()

    await svc.unfriend(friendship_id=only.id, actor_id="alice")
    assert only.id not in friendships.rows
    assert pub.published[-1][0] == "user:bob"
    assert pub.published[-1][1]["type"] == "friend.removed"


@pytest.mark.asyncio
async def test_unfriend_pending_raises_validation() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, *_ = _service(users=users)
    row = await svc.request(requester_id="alice", target_id="bob")
    with pytest.raises(ValidationError):
        await svc.unfriend(friendship_id=row.id, actor_id="alice")


@pytest.mark.asyncio
async def test_list_focusing_now_filters_to_accepted_friends_with_active_session() -> None:
    users = FakeUserRepo.from_users(
        [_user("me"), _user("friend"), _user("stranger")]
    )
    svc, friendships, sessions, _ = _service(users=users)
    # me ↔ friend accepted; stranger is not a friend.
    row = await svc.request(requester_id="me", target_id="friend")
    await svc.accept(friendship_id=row.id, accepter_id="friend")
    # Active sessions: friend (in scope), stranger (not in scope).
    sessions.sessions = [
        FocusSession(
            id="s1",
            user_id="friend",
            partner_user_id=None,
            mode=FocusSessionMode.FOCUS,
            duration_seconds=25 * 60,
            elapsed_seconds=0,
            status=FocusSessionStatus.ACTIVE,
            task_label=None,
            started_at=datetime(2026, 5, 19, 11, 0, tzinfo=UTC),
            ended_at=None,
        ),
        FocusSession(
            id="s2",
            user_id="stranger",
            partner_user_id=None,
            mode=FocusSessionMode.FOCUS,
            duration_seconds=25 * 60,
            elapsed_seconds=0,
            status=FocusSessionStatus.ACTIVE,
            task_label=None,
            started_at=datetime(2026, 5, 19, 11, 0, tzinfo=UTC),
            ended_at=None,
        ),
    ]
    rows = await svc.list_focusing_now(user_id="me")
    assert [r.user_id for r in rows] == ["friend"]


@pytest.mark.asyncio
async def test_accept_unknown_friendship_raises_not_found() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, *_ = _service(users=users)
    with pytest.raises(NotFoundError):
        await svc.accept(friendship_id="ghost", accepter_id="bob")


# ── search_users ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_empty_query_returns_empty() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, *_ = _service(users=users)
    assert await svc.search_users(viewer_id="alice", query="") == []
    assert await svc.search_users(viewer_id="alice", query="   ") == []


@pytest.mark.asyncio
async def test_search_self_is_filtered_out() -> None:
    users = FakeUserRepo.from_users([_user("alice")])
    svc, *_ = _service(users=users)
    assert await svc.search_users(viewer_id="alice", query="alice") == []


@pytest.mark.asyncio
async def test_search_unknown_user_returns_empty() -> None:
    users = FakeUserRepo.from_users([_user("alice")])
    svc, *_ = _service(users=users)
    assert await svc.search_users(viewer_id="alice", query="ghost") == []


@pytest.mark.asyncio
async def test_search_known_user_with_no_friendship_returns_status_none() -> None:
    users = FakeUserRepo.from_users(
        [_user("alice"), _user("bob", name="Bob")]
    )
    svc, *_ = _service(users=users)
    results = await svc.search_users(viewer_id="alice", query="bob")
    assert len(results) == 1
    hit = results[0]
    assert hit.user_id == "bob"
    assert hit.display_name == "Bob"
    assert hit.friendship_status == "none"
    assert hit.friendship_id is None
    assert hit.requested_by_me is False


@pytest.mark.asyncio
async def test_search_when_request_outgoing_tags_requested_by_me() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, *_ = _service(users=users)
    await svc.request(requester_id="alice", target_id="bob")
    results = await svc.search_users(viewer_id="alice", query="bob")
    assert results[0].friendship_status == "requested"
    assert results[0].requested_by_me is True
    assert results[0].friendship_id is not None


@pytest.mark.asyncio
async def test_search_when_request_incoming_tags_not_requested_by_me() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, *_ = _service(users=users)
    await svc.request(requester_id="bob", target_id="alice")
    results = await svc.search_users(viewer_id="alice", query="bob")
    assert results[0].friendship_status == "requested"
    assert results[0].requested_by_me is False


@pytest.mark.asyncio
async def test_search_when_already_friends_returns_accepted_status() -> None:
    users = FakeUserRepo.from_users([_user("alice"), _user("bob")])
    svc, friendships, *_ = _service(users=users)
    row = await svc.request(requester_id="alice", target_id="bob")
    await svc.accept(friendship_id=row.id, accepter_id="bob")
    results = await svc.search_users(viewer_id="alice", query="bob")
    assert results[0].friendship_status == "accepted"
