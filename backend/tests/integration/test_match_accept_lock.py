"""MatchingService.accept advisory-lock integration test.

What this test pins:
- Two concurrent ``accept(match_id=X)`` calls against the *same* match
  must serialise via ``pg_advisory_xact_lock``. Today the underlying
  ``UPDATE ... SET status='accepted' WHERE id=:id`` is idempotent on its
  own, but Phase 07 will hang room-creation off this method — at that
  point, an unlocked race would INSERT two rows into ``match_rooms``.
- Released-on-COMMIT semantics: after both transactions complete, the
  lock has been released (verified by a third accept that returns
  without blocking — by then the row is ACCEPTED, so it raises
  ``ConflictError("match_not_pending")`` rather than hanging).
- Exactly one ``MatchAccepted`` event is published — the second caller
  enters accept() with the lock held, reads the post-commit ACCEPTED
  status, and bails before publishing.

Requires real Postgres (advisory locks don't exist in SQLite). Uses two
independent async engines so the two callers really commit on different
connections, not just two coroutines sharing a session.
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
from app.domain.events import MatchAccepted
from app.domain.services.matching_service import MatchingService
from app.domain.services.strategies import SimpleOverlapStrategy
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlMatchRepo,
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
    return MatchingService(
        users=SqlUserRepo(session),
        matches=SqlMatchRepo(session),
        sessions=SqlFocusSessionRepo(session),
        strategy=SimpleOverlapStrategy(),
        events=events,
        ids=_StubIds(),
        clock=_StubClock(),
        session=session,
    )


@pytest.fixture
async def seeded(integration_env):
    """Insert two users + one pending match via a one-off engine so the
    rows are visible across the independent connections the test uses
    below. Teardown deletes everything to keep the testcontainer DB
    clean for other tests.
    """
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    requester_id = str(uuid4())
    candidate_id = str(uuid4())
    match_id = str(uuid4())
    now_naive = datetime.now(UTC).replace(tzinfo=None)
    try:
        async with engine.begin() as conn:
            for uid, email in [
                (requester_id, f"r-{requester_id}@accept-lock.test"),
                (candidate_id, f"c-{candidate_id}@accept-lock.test"),
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
    """Open a fresh engine, run accept() inside a single committed
    transaction, then dispose. Returns the outcome label for assertion:
    "accepted" if it returned a Match, or a short error code from the
    raised ConflictError.
    """
    engine = create_async_engine(db_url, future=True)
    try:
        async with engine.connect() as conn:
            async with conn.begin():
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


async def test_parallel_accept_serialises_and_publishes_once(
    integration_env, seeded
):
    events = EventBus()
    accepted: list[MatchAccepted] = []

    async def _record(e: MatchAccepted) -> None:
        accepted.append(e)

    events.subscribe(MatchAccepted, _record)

    outcomes = await asyncio.gather(
        _accept_in_own_tx(
            integration_env["DATABASE_URL"],
            seeded["match_id"],
            seeded["requester_id"],
            events,
        ),
        _accept_in_own_tx(
            integration_env["DATABASE_URL"],
            seeded["match_id"],
            seeded["candidate_id"],
            events,
        ),
    )

    # Exactly one accept succeeds; the other observes the already-ACCEPTED
    # status (thanks to the advisory lock serialising the reads). Without
    # the lock both would read PENDING and the test would record two
    # MatchAccepted events.
    assert sorted(outcomes) == sorted(["accepted", "conflict:match_not_pending"])
    assert len(accepted) == 1
    assert accepted[0].match_id == seeded["match_id"]


async def test_lock_released_after_each_transaction(integration_env, seeded):
    """A third accept *after* the race must not block — proving the lock
    is released on COMMIT/ROLLBACK rather than held for the lifetime of
    the engine. We can't observe release directly; instead we run two
    serialised accepts (the second sees ACCEPTED and raises) and then a
    third — if any of them hangs, the test would time out.
    """
    events = EventBus()
    first = await _accept_in_own_tx(
        integration_env["DATABASE_URL"],
        seeded["match_id"],
        seeded["requester_id"],
        events,
    )
    second = await _accept_in_own_tx(
        integration_env["DATABASE_URL"],
        seeded["match_id"],
        seeded["candidate_id"],
        events,
    )
    third = await _accept_in_own_tx(
        integration_env["DATABASE_URL"],
        seeded["match_id"],
        seeded["requester_id"],
        events,
    )

    assert first == "accepted"
    assert second == "conflict:match_not_pending"
    assert third == "conflict:match_not_pending"
