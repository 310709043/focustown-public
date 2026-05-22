"""End-to-end ``match_rooms`` lifecycle integration test.

What this pins:

- The full flow accept → both join → both leave produces the expected
  state transitions: ``open`` → ``both_joined`` → ``ended`` with
  ``ended_reason='both_left'``.
- ``focus_sessions.match_id`` and ``focus_sessions.room_id`` accept
  values written through ``FocusSessionService.start`` without
  changing the existing behaviour for solo sessions.

Requires real Postgres so we exercise the actual ON CONFLICT DO
NOTHING / ON DELETE CASCADE semantics — SQLite would fake-pass.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.events import EventBus
from app.core.exceptions import NotFoundError
from app.domain.models import Match, MatchStatus
from app.domain.services.match_room_service import MatchRoomService
from app.infrastructure.db.repositories.match_room_repo import SqlMatchRoomRepo
from app.infrastructure.db.repositories.room_participant_repo import (
    SqlRoomParticipantRepo,
)

pytestmark = pytest.mark.asyncio


class _StubClock:
    def __init__(self) -> None:
        self.current = datetime.now(UTC)

    def now(self) -> datetime:
        return self.current


class _StubIds:
    def new_id(self) -> str:
        return str(uuid4())


@pytest.fixture
async def seeded_match(integration_env):
    """Insert two users + one accepted match. Tests then use this
    match_id with the service. Teardown cascades through the
    match_rooms FK (ON DELETE CASCADE) so we don't have to clean up
    rooms or participants explicitly.
    """
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    requester_id = str(uuid4())
    candidate_id = str(uuid4())
    match_id = str(uuid4())
    now_naive = datetime.now(UTC).replace(tzinfo=None)
    try:
        async with engine.begin() as conn:
            for uid, email in [
                (requester_id, f"r-{requester_id}@room-life.test"),
                (candidate_id, f"c-{candidate_id}@room-life.test"),
            ]:
                await conn.execute(
                    text(
                        "INSERT INTO users (id, email, password_hash, "
                        "display_name, is_active, is_bot, marketing_opt_in, "
                        "created_at, updated_at) VALUES (:id, :email, 'x', "
                        "'T', true, false, false, :now, :now)"
                    ),
                    {"id": uid, "email": email, "now": now_naive},
                )
            await conn.execute(
                text(
                    "INSERT INTO matches (id, requester_id, candidate_id, "
                    "compatibility, reason, status, created_at, updated_at) "
                    "VALUES (:id, :r, :c, 70, '', 'accepted', :now, :now)"
                ),
                {
                    "id": match_id,
                    "r": requester_id,
                    "c": candidate_id,
                    "now": now_naive,
                },
            )
        yield {
            "requester_id": requester_id,
            "candidate_id": candidate_id,
            "match_id": match_id,
            "url": integration_env["DATABASE_URL"],
        }
    finally:
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM matches WHERE id = :id"), {"id": match_id}
            )
            await conn.execute(
                text("DELETE FROM users WHERE id IN (:r, :c)"),
                {"r": requester_id, "c": candidate_id},
            )
        await engine.dispose()


def _make_match(seeded: dict) -> Match:
    now = datetime.now(UTC)
    return Match(
        id=seeded["match_id"],
        requester_id=seeded["requester_id"],
        candidate_id=seeded["candidate_id"],
        compatibility=70,
        reason="",
        status=MatchStatus.ACCEPTED,
        created_at=now,
        updated_at=now,
    )


async def test_full_lifecycle_open_to_ended(seeded_match):
    """Walk a room through accept → both join → both leave."""
    engine = create_async_engine(seeded_match["url"], future=True)
    try:
        async with engine.connect() as conn, conn.begin():
            from sqlalchemy.ext.asyncio import AsyncSession

            session = AsyncSession(bind=conn, expire_on_commit=False)
            try:
                svc = MatchRoomService(
                    rooms=SqlMatchRoomRepo(session),
                    participants=SqlRoomParticipantRepo(session),
                    events=EventBus(),
                    ids=_StubIds(),
                    clock=_StubClock(),
                )
                match = _make_match(seeded_match)
                room, parts = await svc.ensure_room_for_match(match)
                assert room.status == "open"
                assert {p.user_id for p in parts} == {
                    seeded_match["requester_id"],
                    seeded_match["candidate_id"],
                }

                snap_a = await svc.join(
                    match_id=match.id, user_id=seeded_match["requester_id"]
                )
                assert snap_a.room.status == "open"

                snap_b = await svc.join(
                    match_id=match.id, user_id=seeded_match["candidate_id"]
                )
                assert snap_b.room.status == "both_joined"
                assert snap_b.room.activated_at is not None

                await svc.leave(
                    match_id=match.id, user_id=seeded_match["requester_id"]
                )
                snap_end = await svc.leave(
                    match_id=match.id, user_id=seeded_match["candidate_id"]
                )
                assert snap_end.room.status == "ended"
                assert snap_end.room.ended_reason == "both_left"
            finally:
                await session.close()
    finally:
        await engine.dispose()


async def test_focus_session_can_be_tagged_with_match_and_room(seeded_match):
    """``focus_sessions.match_id`` and ``room_id`` accept FK values."""
    engine = create_async_engine(seeded_match["url"], future=True)
    try:
        async with engine.connect() as conn, conn.begin():
            from sqlalchemy.ext.asyncio import AsyncSession

            session = AsyncSession(bind=conn, expire_on_commit=False)
            try:
                svc = MatchRoomService(
                    rooms=SqlMatchRoomRepo(session),
                    participants=SqlRoomParticipantRepo(session),
                    events=EventBus(),
                    ids=_StubIds(),
                    clock=_StubClock(),
                )
                match = _make_match(seeded_match)
                room, _ = await svc.ensure_room_for_match(match)
                await session.flush()

                from app.core.clock import SystemClock
                from app.core.ids import UUID4Generator
                from app.domain.models import FocusSessionMode
                from app.domain.services.focus_session_service import (
                    FocusSessionService,
                )
                from app.infrastructure.db.repositories import (
                    SqlFocusSessionRepo,
                    SqlMatchRepo,
                )

                fs = FocusSessionService(
                    repo=SqlFocusSessionRepo(session),
                    clock=SystemClock(),
                    ids=UUID4Generator(),
                    events=EventBus(),
                    matches=SqlMatchRepo(session),
                )
                started = await fs.start(
                    user_id=seeded_match["requester_id"],
                    mode=FocusSessionMode.FOCUS,
                    duration_seconds=600,
                    task_label=None,
                    partner_user_id=seeded_match["candidate_id"],
                    match_id=match.id,
                    room_id=room.id,
                )
                # Re-read via raw SQL to assert the columns landed —
                # the domain model doesn't expose them.
                tagged = await session.execute(
                    text(
                        "SELECT match_id, room_id FROM focus_sessions "
                        "WHERE id = :id"
                    ),
                    {"id": started.id},
                )
                row = tagged.one()
                assert row.match_id == match.id
                assert row.room_id == room.id
            finally:
                await session.close()
    finally:
        await engine.dispose()


async def test_non_participant_snapshot_returns_not_found(seeded_match):
    """Outsider gets ``NotFoundError`` (translates to 404 at API level),
    not ``ForbiddenError`` — so room existence isn't leaked."""
    engine = create_async_engine(seeded_match["url"], future=True)
    try:
        async with engine.connect() as conn, conn.begin():
            from sqlalchemy.ext.asyncio import AsyncSession

            session = AsyncSession(bind=conn, expire_on_commit=False)
            try:
                svc = MatchRoomService(
                    rooms=SqlMatchRoomRepo(session),
                    participants=SqlRoomParticipantRepo(session),
                    events=EventBus(),
                    ids=_StubIds(),
                    clock=_StubClock(),
                )
                match = _make_match(seeded_match)
                await svc.ensure_room_for_match(match)

                with pytest.raises(NotFoundError):
                    await svc.get_snapshot(
                        match_id=match.id,
                        requesting_user_id=str(uuid4()),  # stranger
                    )
            finally:
                await session.close()
    finally:
        await engine.dispose()
