"""Reusable in-memory fakes that implement domain Protocols.

Keep these dependency-free so unit tests stay fast and isolated from
infrastructure (no DB, no Redis, no real time).
"""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.core.clock import IClock
from app.core.exceptions import NotFoundError
from app.core.ids import IIdGenerator
from app.core.sentinels import UNSET, UnsetType
from app.domain.models import User
from app.domain.models.room import Room, RoomVisibility
from app.domain.notifications import INotificationService
from app.domain.repositories.leaderboard_snapshot_repo import (
    ILeaderboardSnapshotRepo,
    LeaderboardSnapshotRecord,
)
from app.domain.repositories.password_reset_token_repo import (
    IPasswordResetTokenRepo,
    ResetTokenRecord,
)
from app.domain.repositories.presence import (
    IPresenceTracker,
    PresenceEntry,
    PresenceState,
)
from app.domain.repositories.room_repo import IRoomRepo, RoomAlreadyExistsError
from app.domain.repositories.shop_repo import IShopRepo, ShopItemRecord
from app.domain.repositories.user_item_repo import IUserItemRepo, UserItem
from app.domain.repositories.user_repo import IUserRepo, UserCredentials
from app.infrastructure.auth.providers.base import AuthProvider, Principal, TokenPair


@dataclass(slots=True)
class FakeClock(IClock):
    current: datetime

    def now(self) -> datetime:
        return self.current

    def advance(self, delta: timedelta) -> None:
        self.current = self.current + delta


@dataclass(slots=True)
class FakeIdGen(IIdGenerator):
    seq: Iterator[str] = field(default_factory=lambda: (f"id-{i}" for i in range(1, 10_000)))

    def new_id(self) -> str:
        return next(self.seq)


@dataclass
class FakeNotifier(INotificationService):
    emails: list[dict] = field(default_factory=list)
    pushes: list[dict] = field(default_factory=list)

    async def send_email(self, *, to: str, subject: str, body: str) -> None:
        self.emails.append({"to": to, "subject": subject, "body": body})

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        self.pushes.append({"user_id": user_id, "title": title, "body": body})


@dataclass
class FakeUserRepo(IUserRepo):
    users: dict[str, User] = field(default_factory=dict)
    hashes: dict[str, str] = field(default_factory=dict)
    updates: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_users(cls, users: list[User]) -> FakeUserRepo:
        repo = cls()
        for u in users:
            repo.users[u.id] = u
        return repo

    async def get_by_id(self, user_id: str) -> User | None:
        return self.users.get(user_id)

    async def get_by_email(self, email: str) -> User | None:
        e = email.lower()
        return next((u for u in self.users.values() if u.email == e), None)

    async def get_credentials_by_email(self, email: str) -> UserCredentials | None:
        u = await self.get_by_email(email)
        if u is None:
            return None
        return UserCredentials(user=u, password_hash=self.hashes[u.id])

    async def get_many_by_ids(self, user_ids: list[str]) -> list[User]:
        return [self.users[uid] for uid in user_ids if uid in self.users]

    async def create(
        self,
        *,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
        terms_accepted_at: datetime | None = None,
        terms_version: str | None = None,
        marketing_opt_in: bool = False,
        marketing_opt_in_at: datetime | None = None,
    ) -> User:
        now = datetime.now(UTC)
        user = User(
            id=user_id,
            email=email.lower(),
            display_name=display_name,
            character_key=None,
            role_label=None,
            is_active=True,
            equipped_vehicle_item_id=None,
            equipped_avatar_item_id=None,
            created_at=now,
            updated_at=now,
            terms_accepted_at=terms_accepted_at,
            terms_version=terms_version,
            marketing_opt_in=marketing_opt_in,
            marketing_opt_in_at=marketing_opt_in_at,
        )
        self.users[user_id] = user
        self.hashes[user_id] = password_hash
        return user

    async def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None = None,
        character_key: str | None = None,
        role_label: str | None = None,
    ) -> User:
        u = self.users[user_id]
        if display_name is not None:
            u.display_name = display_name
        if character_key is not None:
            u.character_key = character_key
        if role_label is not None:
            u.role_label = role_label
        return u

    async def update_password_hash(self, *, user_id: str, password_hash: str) -> None:
        self.hashes[user_id] = password_hash

    async def update_equipment(
        self,
        *,
        user_id: str,
        equipped_vehicle_item_id: str | None | UnsetType = UNSET,
        equipped_avatar_item_id: str | None | UnsetType = UNSET,
    ) -> User:
        u = self.users[user_id]
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
        self.users[user_id] = new
        return new

    async def list_recent(self, *, limit: int) -> list[User]:
        return list(self.users.values())[:limit]


@dataclass
class FakeResetTokenRepo(IPasswordResetTokenRepo):
    records: dict[str, ResetTokenRecord] = field(default_factory=dict)

    async def create(
        self,
        *,
        token_id: str,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
        requested_ip: str | None,
    ) -> None:
        self.records[token_id] = ResetTokenRecord(
            id=token_id,
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            consumed_at=None,
            created_at=expires_at - timedelta(hours=1),
        )

    async def find_active_by_hash(self, token_hash: str) -> ResetTokenRecord | None:
        return next(
            (
                r
                for r in self.records.values()
                if r.token_hash == token_hash and r.consumed_at is None
            ),
            None,
        )

    async def mark_consumed(self, token_id: str, *, at: datetime) -> None:
        r = self.records[token_id]
        self.records[token_id] = ResetTokenRecord(
            id=r.id,
            user_id=r.user_id,
            token_hash=r.token_hash,
            expires_at=r.expires_at,
            consumed_at=at,
            created_at=r.created_at,
        )

    async def invalidate_active_for_user(self, user_id: str, *, at: datetime) -> None:
        for tid, r in list(self.records.items()):
            if r.user_id == user_id and r.consumed_at is None:
                self.records[tid] = ResetTokenRecord(
                    id=r.id,
                    user_id=r.user_id,
                    token_hash=r.token_hash,
                    expires_at=r.expires_at,
                    consumed_at=at,
                    created_at=r.created_at,
                )


# ── Domain repositories ────────────────────────────────────────────────────


@dataclass
class FakeRoomRepo(IRoomRepo):
    """In-memory IRoomRepo. ``raise_on_create_for`` lets a test simulate the
    concurrent lazy-create race: the next ``create`` for that owner will raise
    ``RoomAlreadyExistsError`` even though no row exists, mirroring what the
    SQL impl does when a parallel transaction wins the UNIQUE constraint.
    """

    rows: dict[str, Room] = field(default_factory=dict)
    raise_on_create_for: set[str] = field(default_factory=set)
    preseed_after_race: dict[str, Room] = field(default_factory=dict)

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
        name: str | UnsetType = UNSET,
        theme: str | UnsetType = UNSET,
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


@dataclass
class FakePresenceTracker(IPresenceTracker):
    """In-memory IPresenceTracker.

    Timestamps use ``datetime.now(UTC)`` unless an optional ``clock`` is
    supplied — that's enough for the tests that only assert on state/status
    fields and don't care about exact ``last_seen_at``.
    """

    clock: IClock | None = None
    rows: dict[str, PresenceEntry] = field(default_factory=dict)

    def _now(self) -> datetime:
        return self.clock.now() if self.clock is not None else datetime.now(UTC)

    async def online(
        self,
        user_id: str,
        *,
        state: PresenceState = "on_street",
        status: str = "focus",
    ) -> None:
        self.rows[user_id] = PresenceEntry(
            user_id=user_id,
            state=state,
            status=status,
            last_seen_at=self._now(),
        )

    async def offline(self, user_id: str) -> None:
        self.rows.pop(user_id, None)

    async def update(
        self,
        user_id: str,
        *,
        state: PresenceState | None = None,
        status: str | None = None,
    ) -> None:
        prev = self.rows.get(user_id)
        if prev is None:
            return
        self.rows[user_id] = PresenceEntry(
            user_id=user_id,
            state=state or prev.state,
            status=status or prev.status,
            last_seen_at=self._now(),
        )

    async def get(self, user_id: str) -> PresenceEntry | None:
        return self.rows.get(user_id)

    async def list(
        self, *, state: PresenceState | None = None
    ) -> list[PresenceEntry]:
        rows = list(self.rows.values())
        if state is not None:
            rows = [r for r in rows if r.state == state]
        return rows


@dataclass
class FakeUserItemRepo(IUserItemRepo):
    owned: set[tuple[str, str]] = field(default_factory=set)
    items: dict[str, UserItem] = field(default_factory=dict)

    async def insert(
        self,
        *,
        item_id: str,
        user_id: str,
        shop_item_id: str,
        acquired_via: str,
        wallet_transaction_id: str | None,
    ) -> UserItem:
        row = UserItem(
            id=item_id,
            user_id=user_id,
            shop_item_id=shop_item_id,
            acquired_via=acquired_via,
            wallet_transaction_id=wallet_transaction_id,
            acquired_at=datetime.now(UTC),
        )
        self.items[item_id] = row
        self.owned.add((user_id, shop_item_id))
        return row

    async def list_for_user(self, user_id: str) -> list[UserItem]:
        return [i for i in self.items.values() if i.user_id == user_id]

    async def owns(self, *, user_id: str, shop_item_id: str) -> bool:
        return (user_id, shop_item_id) in self.owned


@dataclass
class FakeShopRepo(IShopRepo):
    """In-memory IShopRepo.

    Two construction styles supported:
    - ``FakeShopRepo(items=[...])`` — full ShopItemRecord rows, ``get_render_metas``
      derives metas from those rows.
    - ``FakeShopRepo(render_metas={...})`` — only metas (other queries return empty).
    """

    items: list[ShopItemRecord] = field(default_factory=list)
    render_metas: dict[str, dict[str, Any] | None] = field(default_factory=dict)

    async def list_all(self) -> list[ShopItemRecord]:
        return list(self.items)

    async def list_by_category(self, category: str) -> list[ShopItemRecord]:
        return [i for i in self.items if i.category == category]

    async def get_by_id(self, item_id: str) -> ShopItemRecord | None:
        for i in self.items:
            if i.id == item_id:
                return i
        return None

    async def get_render_metas(
        self, item_ids: list[str]
    ) -> dict[str, dict[str, Any] | None]:
        if self.render_metas:
            return {i: self.render_metas.get(i) for i in item_ids}
        by_id = {i.id: i for i in self.items}
        return {i: by_id[i].render_meta for i in item_ids if i in by_id}


@dataclass
class FakeAuthProvider(AuthProvider):
    """Deterministic AuthProvider — tokens are derived from user_id so tests
    can assert on them. ``refresh`` / ``verify_access_token`` raise by default
    because they're irrelevant to the happy-path AuthService tests; override
    in-test if you need them."""

    issued: list[str] = field(default_factory=list)

    async def issue_tokens(self, *, user_id: str) -> TokenPair:
        self.issued.append(user_id)
        return TokenPair(
            access_token=f"at:{user_id}", refresh_token=f"rt:{user_id}"
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        raise NotImplementedError

    async def verify_access_token(self, token: str) -> Principal:
        raise NotImplementedError


@dataclass
class RecordingPublisher:
    """Test double for IRealtimePublisher — duck-typed, no Protocol
    coupling. Captures every ``publish`` call as ``(channel, payload)``."""

    published: list[tuple[str, dict[str, Any]]] = field(default_factory=list)

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
        self.published.append((channel, payload))


@dataclass
class FakeLeaderboardSnapshotRepo(ILeaderboardSnapshotRepo):
    """In-memory ILeaderboardSnapshotRepo. Stores rows keyed by
    ``(snapshot_date, user_id)`` so repeated ``upsert_day`` calls are
    idempotent (subsequent insertions of the same key return 0)."""

    rows: dict[tuple[date, str], LeaderboardSnapshotRecord] = field(default_factory=dict)
    calls: list[tuple[date, list[LeaderboardSnapshotRecord]]] = field(default_factory=list)

    async def upsert_day(
        self,
        *,
        snapshot_date: date,
        entries: list[LeaderboardSnapshotRecord],
    ) -> int:
        self.calls.append((snapshot_date, list(entries)))
        inserted = 0
        for e in entries:
            key = (snapshot_date, e.user_id)
            if key in self.rows:
                continue
            self.rows[key] = e
            inserted += 1
        return inserted
