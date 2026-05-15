"""Unit tests for the bot presence seeder."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.models import User
from app.infrastructure.presence.bot_seeder import refresh_bot_presence
from tests.unit.fakes import FakePresenceTracker, FakeUserRepo


def _bot(uid: str, *, is_bot: bool = True) -> User:
    now = datetime(2026, 5, 17, 12, tzinfo=UTC)
    return User(
        id=uid,
        email=f"{uid}@bots.focustown.local",
        display_name=uid.title(),
        character_key=uid,
        role_label="tester",
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=now,
        updated_at=now,
        is_bot=is_bot,
    )


@pytest.mark.asyncio
async def test_refresh_bot_presence_writes_each_bot_as_on_street() -> None:
    bots = [_bot("luna"), _bot("kai"), _bot("zoe")]
    real = _bot("alice", is_bot=False)
    users = FakeUserRepo.from_users([*bots, real])
    tracker = FakePresenceTracker()

    count = await refresh_bot_presence(reader=users, tracker=tracker)

    assert count == 3
    assert set(tracker.rows.keys()) == {"luna", "kai", "zoe"}
    assert all(e.state == "on_street" for e in tracker.rows.values())


@pytest.mark.asyncio
async def test_refresh_bot_presence_skips_non_bots() -> None:
    real = _bot("alice", is_bot=False)
    users = FakeUserRepo.from_users([real])
    tracker = FakePresenceTracker()

    count = await refresh_bot_presence(reader=users, tracker=tracker)

    assert count == 0
    assert tracker.rows == {}


@pytest.mark.asyncio
async def test_refresh_bot_presence_is_idempotent() -> None:
    bots = [_bot("luna"), _bot("kai")]
    users = FakeUserRepo.from_users(bots)
    tracker = FakePresenceTracker()

    await refresh_bot_presence(reader=users, tracker=tracker)
    first_keys = set(tracker.rows.keys())
    await refresh_bot_presence(reader=users, tracker=tracker)
    second_keys = set(tracker.rows.keys())

    assert first_keys == second_keys == {"luna", "kai"}
