"""SqlMatchWaitingPoolRepo against real Postgres.

Lives under ``integration/db/`` rather than ``unit/`` because every
assertion in this file checks behaviour that only Postgres can honestly
produce:

* ``upsert_waiting`` round-trips through ``INSERT ... ON CONFLICT DO
  UPDATE`` keyed on ``user_id``. A mocked session would just verify the
  call signature — not that two enqueues actually collapse to one row.
* ``mark_paired`` / ``mark_pair_paired`` set ``status`` and ``match_id``
  in a single UPDATE statement; the atomicity is the whole point.
* ``list_waiting`` filters by ``status='waiting'`` AND orders by
  ``enqueued_at_ms`` — both checks exercise the SQL, not Python.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.infrastructure.db.repositories.match_waiting_pool_repo import (
    SqlMatchWaitingPoolRepo,
)


async def _insert_user(db_session, *, user_id: str, email: str) -> None:
    now = datetime.now(UTC).replace(tzinfo=None) + timedelta(
        seconds=hash(user_id) % 1000
    )
    await db_session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, "
            "is_active, is_bot, created_at, updated_at) VALUES "
            "(:id, :email, 'x', 'Test', true, false, :now, :now)"
        ),
        {"id": user_id, "email": email, "now": now},
    )


@pytest.mark.asyncio
async def test_upsert_waiting_twice_for_same_user_yields_single_row(
    db_session,
) -> None:
    await _insert_user(db_session, user_id="u-alice", email="alice@x")
    repo = SqlMatchWaitingPoolRepo(db_session)

    await repo.upsert_waiting(
        "u-alice", enqueued_at_ms=1_000, fallback_deadline_ms=2_000
    )
    # Mark cancelled in between to prove the second upsert RESETS status.
    await repo.mark_cancelled("u-alice")
    await repo.upsert_waiting(
        "u-alice", enqueued_at_ms=9_000, fallback_deadline_ms=12_000
    )

    record = await repo.get("u-alice")
    assert record is not None
    assert record.status == "waiting"
    assert record.enqueued_at_ms == 9_000
    assert record.fallback_deadline_ms == 12_000
    assert record.match_id is None

    # Confirm row count via SQL — assertion above only proves the latest
    # values; this proves we didn't accumulate ghost rows.
    count = (
        await db_session.execute(
            text(
                "SELECT count(*) FROM match_waiting_pool WHERE user_id = :uid"
            ),
            {"uid": "u-alice"},
        )
    ).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_mark_paired_sets_status_and_match_id(db_session) -> None:
    await _insert_user(db_session, user_id="u-bob", email="bob@x")
    repo = SqlMatchWaitingPoolRepo(db_session)
    await repo.upsert_waiting(
        "u-bob", enqueued_at_ms=100, fallback_deadline_ms=200
    )

    await repo.mark_paired("u-bob", match_id="m-1")

    record = await repo.get("u-bob")
    assert record is not None
    assert record.status == "paired"
    assert record.match_id == "m-1"


@pytest.mark.asyncio
async def test_mark_pair_paired_flips_both_sides_in_one_update(
    db_session,
) -> None:
    """Two-row UPDATE is the whole point: the reconciler must not see a
    half-state where one side is ``paired`` and the other is still
    ``waiting``, otherwise it would re-enqueue the waiting side and undo
    the pair."""
    await _insert_user(db_session, user_id="u-a", email="a@x")
    await _insert_user(db_session, user_id="u-b", email="b@x")
    repo = SqlMatchWaitingPoolRepo(db_session)
    await repo.upsert_waiting("u-a", enqueued_at_ms=1, fallback_deadline_ms=2)
    await repo.upsert_waiting("u-b", enqueued_at_ms=3, fallback_deadline_ms=4)

    await repo.mark_pair_paired("u-a", "u-b", match_id="m-pair")

    a = await repo.get("u-a")
    b = await repo.get("u-b")
    assert a is not None and a.status == "paired" and a.match_id == "m-pair"
    assert b is not None and b.status == "paired" and b.match_id == "m-pair"


@pytest.mark.asyncio
async def test_list_waiting_filters_by_status_and_orders_by_enqueue_time(
    db_session,
) -> None:
    await _insert_user(db_session, user_id="u-late", email="late@x")
    await _insert_user(db_session, user_id="u-early", email="early@x")
    await _insert_user(db_session, user_id="u-cancelled", email="cancel@x")
    await _insert_user(db_session, user_id="u-paired", email="paired@x")
    await _insert_user(db_session, user_id="u-bot", email="bot@x")
    repo = SqlMatchWaitingPoolRepo(db_session)
    await repo.upsert_waiting(
        "u-late", enqueued_at_ms=2_000, fallback_deadline_ms=3_000
    )
    await repo.upsert_waiting(
        "u-early", enqueued_at_ms=1_000, fallback_deadline_ms=2_000
    )
    await repo.upsert_waiting(
        "u-cancelled", enqueued_at_ms=500, fallback_deadline_ms=1_500
    )
    await repo.mark_cancelled("u-cancelled")
    await repo.upsert_waiting(
        "u-paired", enqueued_at_ms=600, fallback_deadline_ms=1_600
    )
    await repo.mark_paired("u-paired", match_id="m-x")
    await repo.upsert_waiting(
        "u-bot", enqueued_at_ms=700, fallback_deadline_ms=1_700
    )
    await repo.mark_bot_fallback("u-bot")

    waiting = await repo.list_waiting()

    assert [r.user_id for r in waiting] == ["u-early", "u-late"]


@pytest.mark.asyncio
async def test_mark_bot_fallback_is_terminal_state(db_session) -> None:
    """A row marked ``bot_fallback`` must NOT appear in ``list_waiting``
    — the reconciler relies on this so a Redis FLUSHALL after a bot
    fallback completes doesn't re-queue an already-matched user."""
    await _insert_user(db_session, user_id="u-bot-term", email="bt@x")
    repo = SqlMatchWaitingPoolRepo(db_session)
    await repo.upsert_waiting(
        "u-bot-term", enqueued_at_ms=10, fallback_deadline_ms=20
    )

    await repo.mark_bot_fallback("u-bot-term")

    record = await repo.get("u-bot-term")
    assert record is not None
    assert record.status == "bot_fallback"
    assert [r.user_id for r in await repo.list_waiting()] == []
