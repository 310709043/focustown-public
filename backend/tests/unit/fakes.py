"""Reusable in-memory fakes that implement domain Protocols.

Keep these dependency-free so unit tests stay fast and isolated from
infrastructure (no DB, no Redis, no real time).
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.core.clock import IClock
from app.core.ids import IIdGenerator
from app.domain.models import (
    FocusSession,
    FocusSessionMode,
    FocusSessionStatus,
    Match,
    MatchStatus,
    User,
)
from app.domain.notifications import INotificationService
from app.domain.repositories.achievement_repo import (
    AchievementRecord,
    IAchievementRepo,
)
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.match_repo import IMatchRepo
from app.domain.repositories.password_reset_token_repo import (
    IPasswordResetTokenRepo,
    ResetTokenRecord,
)
from app.domain.repositories.user_repo import IUserRepo, UserCredentials
from app.domain.services.strategies.compatibility import (
    CompatibilityScore,
    ICompatibilityStrategy,
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

    Supports the four query shapes the domain services need:
    ``get``, ``list_active``, ``list_by_user_since``, ``count_completed_today``,
    and ``daily_leaderboard``.
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
    """Tracks (user_id, code) -> granted? Used to assert idempotency."""

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
