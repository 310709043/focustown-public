"""SqlUserRepo against real Postgres.

Worth testing:
- ``list_bots`` returns ONLY rows with ``is_bot=True`` (real users filtered out)
- ``_to_domain`` round-trips the ``is_bot`` flag onto the domain dataclass
- ``list_bots`` orders by ``created_at`` ascending (the seeder relies on a
  stable order so retry logic and tests are deterministic)

NOT worth testing:
- Empty-list edge case — trivial guard
- Other reader methods (``get_by_id``, ``list_recent``) — covered indirectly
  by the auth and matching integration suites
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.infrastructure.db.repositories import SqlUserRepo


async def _insert_user(
    db_session,
    *,
    user_id: str,
    email: str,
    is_bot: bool,
    created_offset_seconds: int = 0,
) -> None:
    created = datetime.now(UTC).replace(tzinfo=None) + timedelta(
        seconds=created_offset_seconds
    )
    await db_session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name, "
            "is_active, is_bot, created_at, updated_at) VALUES "
            "(:id, :email, 'x', 'Test', true, :is_bot, :now, :now)"
        ),
        {"id": user_id, "email": email, "is_bot": is_bot, "now": created},
    )


@pytest.mark.asyncio
async def test_list_bots_returns_only_bots(db_session) -> None:
    await _insert_user(
        db_session, user_id="u-real", email="real@example.com", is_bot=False
    )
    await _insert_user(
        db_session, user_id="u-bot-1", email="bot1@bots.local", is_bot=True
    )
    await _insert_user(
        db_session, user_id="u-bot-2", email="bot2@bots.local", is_bot=True
    )

    bots = await SqlUserRepo(db_session).list_bots()

    assert {b.id for b in bots} == {"u-bot-1", "u-bot-2"}


@pytest.mark.asyncio
async def test_list_bots_round_trips_is_bot_to_domain(db_session) -> None:
    await _insert_user(
        db_session, user_id="u-bot-rt", email="rt@bots.local", is_bot=True
    )

    bots = await SqlUserRepo(db_session).list_bots()

    assert len(bots) == 1
    assert bots[0].is_bot is True


@pytest.mark.asyncio
async def test_list_bots_orders_by_created_at_ascending(db_session) -> None:
    # Insert in reverse creation order so the test fails if the repo sorts
    # by insertion / id rather than created_at.
    await _insert_user(
        db_session,
        user_id="u-bot-late",
        email="late@bots.local",
        is_bot=True,
        created_offset_seconds=100,
    )
    await _insert_user(
        db_session,
        user_id="u-bot-early",
        email="early@bots.local",
        is_bot=True,
        created_offset_seconds=0,
    )

    bots = await SqlUserRepo(db_session).list_bots()

    assert [b.id for b in bots] == ["u-bot-early", "u-bot-late"]
