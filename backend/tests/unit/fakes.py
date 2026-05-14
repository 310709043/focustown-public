"""Reusable in-memory fakes that implement domain Protocols.

Keep these dependency-free so unit tests stay fast and isolated from
infrastructure (no DB, no Redis, no real time).
"""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.core.clock import IClock
from app.core.ids import IIdGenerator
from app.domain.models import User
from app.domain.notifications import INotificationService
from app.domain.repositories.password_reset_token_repo import (
    IPasswordResetTokenRepo,
    ResetTokenRecord,
)
from app.domain.repositories.user_repo import IUserRepo, UserCredentials


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
        now = datetime.now()
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
