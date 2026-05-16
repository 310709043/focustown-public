"""Reusable in-memory fakes that implement domain Protocols.

Keep these dependency-free so unit tests stay fast and isolated from
infrastructure (no DB, no Redis, no real time).
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.core.clock import IClock
from app.core.exceptions import IdempotencyViolationError, NotFoundError
from app.core.ids import IIdGenerator
from app.core.sentinels import UNSET, UnsetType
from app.domain.models import (
    FocusSession,
    FocusSessionMode,
    FocusSessionStatus,
    Match,
    MatchStatus,
    User,
)
from app.domain.models.room import Room, RoomVisibility
from app.domain.models.room_item import RoomItem
from app.domain.models.room_playback import RoomPlayback
from app.domain.models.room_visit import RoomVisit
from app.domain.notifications import INotificationService
from app.domain.repositories.achievement_repo import (
    AchievementRecord,
    IAchievementRepo,
)
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.leaderboard_snapshot_repo import (
    ILeaderboardSnapshotRepo,
    LeaderboardSnapshotRecord,
)
from app.domain.repositories.match_repo import IMatchRepo
from app.domain.repositories.password_reset_token_repo import (
    IPasswordResetTokenRepo,
    ResetTokenRecord,
)
from app.domain.repositories.presence import (
    IPresenceStatusWriter,
    IPresenceTracker,
    PresenceEntry,
    PresenceState,
)
from app.domain.repositories.room_item_repo import IRoomItemRepo
from app.domain.repositories.room_playback_repo import IRoomPlaybackRepo
from app.domain.repositories.room_repo import IRoomRepo, RoomAlreadyExistsError
from app.domain.repositories.room_track_repo import (
    IRoomTrackRepo,
    RoomTrackRecord,
)
from app.domain.repositories.room_visit_repo import IRoomVisitRepo
from app.domain.repositories.shop_repo import IShopRepo, ShopItemRecord
from app.domain.repositories.track_repo import ITrackRepo, TrackRecord
from app.domain.repositories.user_item_repo import IUserItemRepo, UserItem
from app.domain.repositories.user_repo import IUserRepo, UserCredentials
from app.domain.services.strategies.compatibility import (
    CompatibilityScore,
    ICompatibilityStrategy,
)
from app.infrastructure.auth.providers.base import (
    AuthCredentials,
    AuthProvider,
    Principal,
    TokenPair,
)


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
    cognito_subs: dict[str, str] = field(default_factory=dict)  # user_id → sub
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
        cognito_sub: str | None = None,
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
        if cognito_sub:
            self.cognito_subs[user_id] = cognito_sub
        return user

    async def get_id_by_cognito_sub(self, cognito_sub: str) -> str | None:
        for uid, sub in self.cognito_subs.items():
            if sub == cognito_sub:
                return uid
        return None

    async def set_cognito_sub(self, *, user_id: str, cognito_sub: str) -> None:
        if user_id not in self.users:
            raise NotFoundError("user_not_found")
        self.cognito_subs[user_id] = cognito_sub

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

    async def list_bots(self) -> list[User]:
        return [u for u in self.users.values() if u.is_bot]


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
class FakeRoomItemRepo(IRoomItemRepo):
    """In-memory ``IRoomItemRepo`` (composed reader + writer).

    LSP rule: observationally identical to ``SqlRoomItemRepo`` from the
    service's perspective — ``delete`` is idempotent on missing ids, and
    ``update_position`` raises ``NotFoundError`` for unknown items.
    """

    rows: dict[str, RoomItem] = field(default_factory=dict)

    async def list_for_room(self, room_id: str) -> list[RoomItem]:
        items = [r for r in self.rows.values() if r.room_id == room_id]
        items.sort(key=lambda r: (r.z_index, r.created_at))
        return items

    async def get(self, item_id: str) -> RoomItem | None:
        return self.rows.get(item_id)

    async def create(
        self,
        *,
        item_id: str,
        room_id: str,
        user_item_id: str,
        x: int,
        y: int,
        z_index: int,
    ) -> RoomItem:
        now = datetime.now(UTC)
        row = RoomItem(
            id=item_id,
            room_id=room_id,
            user_item_id=user_item_id,
            x=x,
            y=y,
            z_index=z_index,
            created_at=now,
            updated_at=now,
        )
        self.rows[item_id] = row
        return row

    async def update_position(
        self,
        *,
        item_id: str,
        x: int,
        y: int,
        z_index: int | UnsetType = UNSET,
    ) -> RoomItem:
        row = self.rows.get(item_id)
        if row is None:
            raise NotFoundError("room_item_not_found")
        row.x = x
        row.y = y
        if isinstance(z_index, int):
            row.z_index = z_index
        row.updated_at = datetime.now(UTC)
        return row

    async def delete(self, item_id: str) -> None:
        self.rows.pop(item_id, None)


@dataclass
class FakeRoomVisitRepo(IRoomVisitRepo):
    """In-memory ``IRoomVisitRepo`` (composed reader + writer).

    LSP rule: observationally identical to ``SqlRoomVisitRepo`` —
    ``delete`` is idempotent on missing ids, ``create`` raises
    ``ConflictError("already_visiting")`` if the visitor_user_id
    constraint would trip.
    """

    rows: dict[str, RoomVisit] = field(default_factory=dict)

    async def list_by_room(self, room_id: str) -> list[RoomVisit]:
        rows = [r for r in self.rows.values() if r.room_id == room_id]
        rows.sort(key=lambda r: r.joined_at)
        return rows

    async def get_by_user(self, visitor_user_id: str) -> RoomVisit | None:
        return next(
            (r for r in self.rows.values() if r.visitor_user_id == visitor_user_id),
            None,
        )

    async def count_by_room(self, room_id: str) -> int:
        return sum(1 for r in self.rows.values() if r.room_id == room_id)

    async def create(
        self,
        *,
        visit_id: str,
        room_id: str,
        visitor_user_id: str,
    ) -> RoomVisit:
        from app.core.exceptions import ConflictError

        if any(r.visitor_user_id == visitor_user_id for r in self.rows.values()):
            raise ConflictError("already_visiting")
        row = RoomVisit(
            id=visit_id,
            room_id=room_id,
            visitor_user_id=visitor_user_id,
            joined_at=datetime.now(UTC),
        )
        self.rows[visit_id] = row
        return row

    async def delete(self, visit_id: str) -> None:
        self.rows.pop(visit_id, None)


@dataclass
class FakeRoomPlaybackRepo(IRoomPlaybackRepo):
    """In-memory ``IRoomPlaybackRepo`` (composed reader + writer).

    LSP rule: observationally identical to ``SqlRoomPlaybackRepo`` —
    ``upsert`` keyed by ``room_id`` collapses concurrent writes to a
    single row, ``get_by_room`` returns ``None`` when no row exists.
    The synthesized ``id`` mirrors what the PG ``ON CONFLICT DO UPDATE``
    keeps stable across upserts (preserved across mutations of the same
    room_id).
    """

    rows: dict[str, RoomPlayback] = field(default_factory=dict)
    _next_id: int = 1

    async def get_by_room(self, room_id: str) -> RoomPlayback | None:
        return self.rows.get(room_id)

    async def upsert(
        self,
        *,
        room_id: str,
        current_track_id: str | None,
        started_at_ms: int | None,
        paused_at_ms: int | None,
        is_playing: bool,
    ) -> RoomPlayback:
        existing = self.rows.get(room_id)
        if existing is not None:
            row_id = existing.id
        else:
            row_id = f"rp-{self._next_id}"
            self._next_id += 1
        row = RoomPlayback(
            id=row_id,
            room_id=room_id,
            current_track_id=current_track_id,
            started_at_ms=started_at_ms,
            paused_at_ms=paused_at_ms,
            is_playing=is_playing,
        )
        self.rows[room_id] = row
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
        status: str = "afk",
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
class FakePresenceStatusWriter(IPresenceStatusWriter):
    """Records every set_status call. Used by SessionPresenceLink tests."""

    calls: list[tuple[str, str]] = field(default_factory=list)

    async def set_status(self, user_id: str, status: str) -> None:
        self.calls.append((user_id, status))


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

    async def get_by_id_and_owner(
        self, *, user_item_id: str, owner_user_id: str
    ) -> UserItem | None:
        row = self.items.get(user_item_id)
        if row is None or row.user_id != owner_user_id:
            return None
        return row


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
    signed_up: list[str] = field(default_factory=list)
    password_updates: list[tuple[str, str]] = field(default_factory=list)
    next_external_id: str = ""

    async def sign_up_user(self, *, email: str, password: str) -> str:
        del password
        self.signed_up.append(email)
        return self.next_external_id

    async def issue_tokens(
        self,
        *,
        user_id: str,
        credentials: AuthCredentials | None = None,
    ) -> TokenPair:
        del credentials
        self.issued.append(user_id)
        return TokenPair(
            access_token=f"at:{user_id}", refresh_token=f"rt:{user_id}"
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        raise NotImplementedError

    async def verify_access_token(self, token: str) -> Principal:
        raise NotImplementedError

    async def set_password(self, *, user_id: str, new_password: str) -> None:
        self.password_updates.append((user_id, new_password))


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


@dataclass
class FakeTrackRepo(ITrackRepo):
    """In-memory ITrackRepo. Only ``list`` and ``get`` are exercised by
    RoomTrackService; ``insert`` is supported so tests can preload tracks
    via either ``.tracks`` dict or ``await repo.insert(...)``."""

    tracks: dict[str, TrackRecord] = field(default_factory=dict)

    async def list(self, *, mood: str | None = None) -> list[TrackRecord]:
        rows = list(self.tracks.values())
        if mood is not None:
            rows = [t for t in rows if t.mood == mood]
        return rows

    async def list_official(self) -> list[TrackRecord]:
        return sorted(
            (t for t in self.tracks.values() if t.is_official),
            key=lambda t: t.id,
        )

    async def get(self, track_id: str) -> TrackRecord | None:
        return self.tracks.get(track_id)

    async def get_many_by_ids(self, track_ids: list[str]) -> list[TrackRecord]:
        return [self.tracks[tid] for tid in track_ids if tid in self.tracks]

    async def insert(
        self,
        *,
        track_id: str,
        title: str,
        artist: str | None,
        mood: str,
        duration_ms: int | None,
        file_key: str,
        content_type: str,
        file_size_bytes: int,
        license: str | None,
        uploaded_by_user_id: str,
        is_official: bool = False,
    ) -> TrackRecord:
        now = datetime.now(UTC)
        record = TrackRecord(
            id=track_id,
            title=title,
            artist=artist,
            mood=mood,
            duration_ms=duration_ms,
            file_key=file_key,
            content_type=content_type,
            file_size_bytes=file_size_bytes,
            license=license,
            uploaded_by_user_id=uploaded_by_user_id,
            created_at=now,
            updated_at=now,
            is_official=is_official,
        )
        self.tracks[track_id] = record
        return record


@dataclass
class FakeRoomTrackRepo(IRoomTrackRepo):
    """In-memory IRoomTrackRepo. Honors the UNIQUE (room_id, track_id)
    constraint by raising ``IdempotencyViolationError`` so unit tests
    catch the same conflict path the SQL adapter takes (LSP-aligned with
    ``SqlRoomTrackRepo.add``)."""

    rows: list[RoomTrackRecord] = field(default_factory=list)

    async def list_by_room(self, room_id: str) -> list[RoomTrackRecord]:
        return sorted(
            (r for r in self.rows if r.room_id == room_id),
            key=lambda r: r.position,
        )

    async def max_position(self, room_id: str) -> int | None:
        positions = [r.position for r in self.rows if r.room_id == room_id]
        return max(positions) if positions else None

    async def add(
        self,
        *,
        item_id: str,
        room_id: str,
        track_id: str,
        position: int,
    ) -> RoomTrackRecord:
        if any(r.room_id == room_id and r.track_id == track_id for r in self.rows):
            raise IdempotencyViolationError("room_track_already_exists")
        record = RoomTrackRecord(
            id=item_id, room_id=room_id, track_id=track_id, position=position
        )
        self.rows.append(record)
        return record

    async def remove(self, *, room_id: str, track_id: str) -> bool:
        before = len(self.rows)
        self.rows = [
            r for r in self.rows
            if not (r.room_id == room_id and r.track_id == track_id)
        ]
        return len(self.rows) < before


# ── Added by PR1 (test-coverage upgrade) ──────────────────────────────────


def make_user(
    user_id: str = "u-1",
    *,
    email: str | None = None,
    display_name: str = "Alice",
    role_label: str | None = None,
) -> User:
    """Factory: build a populated ``User`` for tests."""
    now = datetime(2026, 1, 1, 12, 0, 0)
    return User(
        id=user_id,
        email=email or f"{user_id}@example.com",
        display_name=display_name,
        character_key=None,
        role_label=role_label,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=now,
        updated_at=now,
    )


@dataclass
class FakeFocusSessionRepo(IFocusSessionRepo):
    """In-memory IFocusSessionRepo with stable insertion order.

    Supports ``get``, ``list_active``, ``list_by_user_since``,
    ``count_completed_today``, and ``daily_leaderboard`` — the four query
    shapes the domain services exercise in unit tests.
    """

    rows: dict[str, FocusSession] = field(default_factory=dict)

    async def create(
        self,
        *,
        session_id: str,
        user_id: str,
        mode: FocusSessionMode,
        duration_seconds: int,
        task_label: str | None,
        partner_user_id: str | None,
        started_at: datetime,
    ) -> FocusSession:
        s = FocusSession(
            id=session_id,
            user_id=user_id,
            partner_user_id=partner_user_id,
            mode=mode,
            duration_seconds=duration_seconds,
            elapsed_seconds=0,
            status=FocusSessionStatus.ACTIVE,
            task_label=task_label,
            started_at=started_at,
            ended_at=None,
        )
        self.rows[session_id] = s
        return s

    async def get(self, session_id: str) -> FocusSession | None:
        return self.rows.get(session_id)

    async def update_status(
        self,
        *,
        session_id: str,
        status: FocusSessionStatus,
        elapsed_seconds: int,
        ended_at: datetime | None,
    ) -> FocusSession:
        s = self.rows[session_id]
        updated = FocusSession(
            id=s.id,
            user_id=s.user_id,
            partner_user_id=s.partner_user_id,
            mode=s.mode,
            duration_seconds=s.duration_seconds,
            elapsed_seconds=elapsed_seconds,
            status=status,
            task_label=s.task_label,
            started_at=s.started_at,
            ended_at=ended_at,
        )
        self.rows[session_id] = updated
        return updated

    async def list_active(self) -> list[FocusSession]:
        return [s for s in self.rows.values() if s.status is FocusSessionStatus.ACTIVE]

    async def list_by_user_since(
        self, *, user_id: str, since: datetime
    ) -> list[FocusSession]:
        return [
            s
            for s in self.rows.values()
            if s.user_id == user_id and s.started_at >= since
        ]

    async def count_completed_today(self, *, user_id: str, day_start: datetime) -> int:
        return sum(
            1
            for s in self.rows.values()
            if s.user_id == user_id
            and s.status is FocusSessionStatus.COMPLETED
            and s.started_at >= day_start
        )

    async def daily_leaderboard(
        self, *, day_start: datetime, limit: int
    ) -> list[tuple[str, int]]:
        counts: dict[str, int] = defaultdict(int)
        for s in self.rows.values():
            if (
                s.status is FocusSessionStatus.COMPLETED
                and s.started_at >= day_start
            ):
                counts[s.user_id] += 1
        ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        return ordered[:limit]


@dataclass
class FakeMatchRepo(IMatchRepo):
    rows: dict[str, Match] = field(default_factory=dict)

    async def create(
        self,
        *,
        match_id: str,
        requester_id: str,
        candidate_id: str,
        compatibility: int,
        reason: str,
    ) -> Match:
        now = datetime(2026, 1, 1, 12, 0, 0)
        m = Match(
            id=match_id,
            requester_id=requester_id,
            candidate_id=candidate_id,
            compatibility=compatibility,
            reason=reason,
            status=MatchStatus.PENDING,
            created_at=now,
            updated_at=now,
        )
        self.rows[match_id] = m
        return m

    async def get(self, match_id: str) -> Match | None:
        return self.rows.get(match_id)

    async def update_status(self, *, match_id: str, status: MatchStatus) -> Match:
        m = self.rows[match_id]
        updated = Match(
            id=m.id,
            requester_id=m.requester_id,
            candidate_id=m.candidate_id,
            compatibility=m.compatibility,
            reason=m.reason,
            status=status,
            created_at=m.created_at,
            updated_at=datetime(2026, 1, 1, 12, 0, 1),
        )
        self.rows[match_id] = updated
        return updated

    async def list_recent_for_user(
        self, *, user_id: str, limit: int
    ) -> list[Match]:
        return [
            m
            for m in self.rows.values()
            if user_id in (m.requester_id, m.candidate_id)
        ][:limit]


@dataclass
class FakeAchievementRepo(IAchievementRepo):
    """Tracks (user_id, code) → granted? Used to assert idempotency."""

    catalog: dict[str, AchievementRecord] = field(default_factory=dict)
    grants: set[tuple[str, str]] = field(default_factory=set)

    async def list_all(self) -> list[AchievementRecord]:
        return list(self.catalog.values())

    async def list_for_user(self, user_id: str) -> list[AchievementRecord]:
        return [
            self.catalog[code]
            for (uid, code) in self.grants
            if uid == user_id and code in self.catalog
        ]

    async def grant(self, *, user_id: str, achievement_code: str) -> bool:
        key = (user_id, achievement_code)
        if key in self.grants:
            return False
        self.grants.add(key)
        return True


@dataclass
class FakeCompatibilityStrategy(ICompatibilityStrategy):
    """Records inputs so tests can assert what the service passed in."""

    score_value: int = 72
    reason_text: str = "fake reason"
    calls: list[dict] = field(default_factory=list)

    async def score(
        self,
        *,
        requester: User,
        candidate: User,
        requester_focus_starts: list[int],
        candidate_focus_starts: list[int],
    ) -> CompatibilityScore:
        self.calls.append(
            {
                "requester_id": requester.id,
                "candidate_id": candidate.id,
                "requester_focus_starts": list(requester_focus_starts),
                "candidate_focus_starts": list(candidate_focus_starts),
            }
        )
        return CompatibilityScore(score=self.score_value, reason=self.reason_text)
