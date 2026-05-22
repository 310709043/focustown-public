"""Concurrent ``MatchingService.accept`` produces exactly one room.

Phase 07's belt + suspenders pattern:

- ``advisory_xact_lock`` (Phase 04) serialises the two transactions on
  ``hash_match_id(match_id)`` so only one reads PENDING and writes
  ACCEPTED.
- The ``ON CONFLICT DO NOTHING`` on ``match_rooms.match_id`` UNIQUE +
  on ``room_participants.(room_id, user_id)`` PK is the second line of
  defence — even if the lock is bypassed (advisory locks do not survive
  a connection drop mid-transaction), at-most-one row per key is
  persisted.

This test uses the same two-engine pattern as
``test_match_accept_lock.py`` so the two ``accept`` calls really commit
on different connections, not just two coroutines on a shared session.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.events import EventBus
from app.core.exceptions import ConflictError
from app.domain.services.match_room_service import MatchRoomService
from app.domain.services.matching_service import MatchingService
from app.domain.services.strategies import SimpleOverlapStrategy
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlMatchRepo,
    SqlMatchRoomRepo,
    SqlRoomParticipantRepo,
    SqlUserRepo,
)

pytestmark = pytest.mark.asyncio


class _StubClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class _StubIds:
    def new_id(self) -> str:
        return str(uuid4())


def _make_service(session: AsyncSession, events: EventBus) -> MatchingService:
    room_svc = MatchRoomService(
        rooms=SqlMatchRoomRepo(session),
        participants=SqlRoomParticipantRepo(session),
        events=events,
        ids=_StubIds(),
        clock=_StubClock(),
    )
    return MatchingService(
        users=SqlUserRepo(session),
        matches=SqlMatchRepo(session),
        sessions=SqlFocusSessionRepo(session),
        strategy=SimpleOverlapStrategy(),
        events=events,
        ids=_StubIds(),
        clock=_StubClock(),
        session=session,
        room_svc=room_svc,
    )


@pytest.fixture
async def seeded(integration_env):
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    requester_id = str(uuid4())
    candidate_id = str(uuid4())
    match_id = str(uuid4())
    now_naive = datetime.now(UTC).replace(tzinfo=None)
    try:
        async with engine.begin() as conn:
            for uid, email in [
                (requester_id, f"r-{requester_id}@accept-idem.test"),
                (candidate_id, f"c-{candidate_id}@accept-idem.test"),
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
                    "VALUES (:id, :r, :c, 50, '', 'pending', :now, :now)"
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


async def _accept_in_own_tx(
    db_url: str, match_id: str, user_id: str, events: EventBus
) -> str:
    engine = create_async_engine(db_url, future=True)
    try:
        async with engine.connect() as conn, conn.begin():
            session = AsyncSession(bind=conn, expire_on_commit=False)
            try:
                svc = _make_service(session, events)
                try:
                    await svc.accept(match_id=match_id, user_id=user_id)
                    return "accepted"
                except ConflictError as exc:
                    return f"conflict:{exc.args[0] if exc.args else ''}"
            finally:
                await session.close()
    finally:
        await engine.dispose()


async def test_parallel_accept_produces_one_room_and_two_participants(seeded):
    """The whole point of Phase 07's idempotency contract."""
    events = EventBus()
    outcomes = await asyncio.gather(
        _accept_in_own_tx(
            seeded["url"], seeded["match_id"], seeded["requester_id"], events
        ),
        _accept_in_own_tx(
            seeded["url"], seeded["match_id"], seeded["candidate_id"], events
        ),
    )
    assert sorted(outcomes) == sorted(["accepted", "conflict:match_not_pending"])

    # Count rows independently — exactly one room + two participants.
    engine = create_async_engine(seeded["url"], future=True)
    try:
        async with engine.begin() as conn:
            room_count = (
                await conn.execute(
                    text(
                        "SELECT COUNT(*) FROM match_rooms WHERE match_id = :m"
                    ),
                    {"m": seeded["match_id"]},
                )
            ).scalar_one()
            assert room_count == 1
            room_id = (
                await conn.execute(
                    text(
                        "SELECT id FROM match_rooms WHERE match_id = :m"
                    ),
                    {"m": seeded["match_id"]},
                )
            ).scalar_one()
            participant_count = (
                await conn.execute(
                    text(
                        "SELECT COUNT(*) FROM room_participants "
                        "WHERE room_id = :r"
                    ),
                    {"r": room_id},
                )
            ).scalar_one()
            assert participant_count == 2
    finally:
        await engine.dispose()
