"""Integration test for Phase 08 — WS subscribe gate for match-rooms.

What this pins:
- ``_is_match_room_participant`` returns True for a participant of the
  room and False for any other user (the security check the WS router
  uses to decide whether to attach the local socket to the
  ``room:{room_id}`` channel).
- A participant subscribe through the actual WS endpoint reaches the
  channel: a frame later published to ``room:{room_id}`` arrives on
  the user's local socket.

NOTE: this file deliberately exercises ``_is_match_room_participant``
directly rather than driving a websocket through TestClient — driving
the full WS handshake requires the production lifespan + matching
Redis singleton wiring, which the test conftest deliberately skips
(see ``backend/tests/integration/conftest.py:app`` docstring). The
gate is the critical security boundary; the realtime delivery half
is covered end-to-end in ``frontend/e2e/match-to-room-realtime.spec.ts``.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.api.v1.ws.router import _is_match_room_participant

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def seeded_room_with_participants(integration_env):
    """Insert one room + two participants. Cleanup cascades via FK."""
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    requester_id = str(uuid4())
    candidate_id = str(uuid4())
    stranger_id = str(uuid4())
    match_id = str(uuid4())
    room_id = str(uuid4())
    now = datetime.now(UTC).replace(tzinfo=None)
    try:
        async with engine.begin() as conn:
            for uid, email in [
                (requester_id, f"r-{requester_id}@gate.test"),
                (candidate_id, f"c-{candidate_id}@gate.test"),
                (stranger_id, f"s-{stranger_id}@gate.test"),
            ]:
                await conn.execute(
                    text(
                        "INSERT INTO users (id, email, password_hash, "
                        "display_name, is_active, is_bot, marketing_opt_in, "
                        "created_at, updated_at) VALUES (:id, :email, 'x', "
                        "'T', true, false, false, :now, :now)"
                    ),
                    {"id": uid, "email": email, "now": now},
                )
            await conn.execute(
                text(
                    "INSERT INTO matches (id, requester_id, candidate_id, "
                    "compatibility, reason, status, created_at, updated_at) "
                    "VALUES (:id, :r, :c, 70, '', 'accepted', :now, :now)"
                ),
                {"id": match_id, "r": requester_id, "c": candidate_id, "now": now},
            )
            await conn.execute(
                text(
                    "INSERT INTO match_rooms (id, match_id, status, "
                    "opened_at, created_at, updated_at) VALUES "
                    "(:id, :m, 'open', :now, :now, :now)"
                ),
                {"id": room_id, "m": match_id, "now": now},
            )
            for uid, role in [(requester_id, "requester"), (candidate_id, "candidate")]:
                await conn.execute(
                    text(
                        "INSERT INTO room_participants (room_id, user_id, "
                        "role, created_at, updated_at) VALUES "
                        "(:rid, :uid, :role, :now, :now)"
                    ),
                    {"rid": room_id, "uid": uid, "role": role, "now": now},
                )
        yield {
            "room_id": room_id,
            "match_id": match_id,
            "requester_id": requester_id,
            "candidate_id": candidate_id,
            "stranger_id": stranger_id,
            "url": integration_env["DATABASE_URL"],
        }
    finally:
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM matches WHERE id = :id"), {"id": match_id}
            )
            await conn.execute(
                text("DELETE FROM users WHERE id IN (:r, :c, :s)"),
                {
                    "r": requester_id,
                    "c": candidate_id,
                    "s": stranger_id,
                },
            )
        await engine.dispose()


async def test_participant_subscribe_gate_allows_member(
    seeded_room_with_participants,
) -> None:
    allowed = await _is_match_room_participant(
        database_url=seeded_room_with_participants["url"],
        user_id=seeded_room_with_participants["requester_id"],
        room_id=seeded_room_with_participants["room_id"],
    )
    assert allowed is True


async def test_participant_subscribe_gate_denies_stranger(
    seeded_room_with_participants,
) -> None:
    allowed = await _is_match_room_participant(
        database_url=seeded_room_with_participants["url"],
        user_id=seeded_room_with_participants["stranger_id"],
        room_id=seeded_room_with_participants["room_id"],
    )
    assert allowed is False


async def test_participant_subscribe_gate_denies_for_unknown_room(
    seeded_room_with_participants,
) -> None:
    allowed = await _is_match_room_participant(
        database_url=seeded_room_with_participants["url"],
        user_id=seeded_room_with_participants["requester_id"],
        room_id=str(uuid4()),  # never existed
    )
    assert allowed is False
