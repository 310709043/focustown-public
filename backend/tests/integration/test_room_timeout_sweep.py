"""Integration test for Phase 08 — open-room timeout sweep.

What this pins:
- ``room_open_timeout_sweep_job`` ends every room that stayed ``open``
  past the 5-min join window.
- The resulting ``RoomEnded`` event fans out as a ``room.ended`` WS
  frame with ``reason='timeout'`` via the worker-registered
  ``RoomRealtimeLink``.

Why integration: the body opens its own session and reaches into
Postgres + Redis, so the unit tier can't cover the join-with-the-job
wiring.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.infrastructure.db.session import get_session_factory
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher
from app.worker import room_open_timeout_sweep_job

pytestmark = pytest.mark.asyncio


async def _wait_subscribed(sub: RedisPubSubPublisher) -> None:
    for _ in range(20):
        if sub._subscribed:
            await asyncio.sleep(0.05)
            return
        await asyncio.sleep(0.05)


@pytest.fixture
async def stale_open_room(integration_env):
    """Seed an ``open`` match_room with ``opened_at`` 6 minutes ago so
    the sweep treats it as past the 5-min cutoff. Returns the ids the
    test asserts against and cleans up via FK cascade on the match row."""
    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    requester_id = str(uuid4())
    candidate_id = str(uuid4())
    match_id = str(uuid4())
    room_id = str(uuid4())
    now = datetime.now(UTC).replace(tzinfo=None)
    opened_at = now - timedelta(minutes=6)
    try:
        async with engine.begin() as conn:
            for uid, email in [
                (requester_id, f"r-{requester_id}@sweep.test"),
                (candidate_id, f"c-{candidate_id}@sweep.test"),
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
                    "(:id, :m, 'open', :opened, :now, :now)"
                ),
                {
                    "id": room_id,
                    "m": match_id,
                    "opened": opened_at,
                    "now": now,
                },
            )
        yield {
            "match_id": match_id,
            "room_id": room_id,
            "requester_id": requester_id,
            "candidate_id": candidate_id,
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


async def test_sweep_ends_stale_room_and_emits_frame(
    stale_open_room, flushed_redis, integration_env
) -> None:
    # Re-init the module-level Redis singleton against the integration
    # container — the worker job uses get_redis() to build the publisher.
    import app.infrastructure.cache.redis_client as redis_client_mod
    from app.infrastructure.cache.redis_client import close_redis, init_redis

    redis_client_mod._client = None
    await init_redis(integration_env["REDIS_URL"])

    room_id = stale_open_room["room_id"]
    received: list[dict] = []
    done = asyncio.Event()

    async def handler(_ch: str, payload: dict) -> None:
        received.append(payload)
        done.set()

    sub = RedisPubSubPublisher(flushed_redis)
    await sub.start(handler=handler, channels=[f"room:{room_id}"])
    try:
        await _wait_subscribed(sub)

        factory = get_session_factory(integration_env["DATABASE_URL"])
        await room_open_timeout_sweep_job(factory)

        try:
            await asyncio.wait_for(done.wait(), timeout=2.0)
        except TimeoutError:
            pass
    finally:
        await sub.stop()
        await close_redis()

    # 1) DB row transitioned to ended/timeout.
    engine = create_async_engine(stale_open_room["url"], future=True)
    try:
        async with engine.connect() as conn:
            res = await conn.execute(
                text(
                    "SELECT status, ended_reason FROM match_rooms "
                    "WHERE id = :id"
                ),
                {"id": room_id},
            )
            row = res.one()
            assert row.status == "ended"
            assert row.ended_reason == "timeout"
    finally:
        await engine.dispose()

    # 2) WS frame fired with reason=timeout.
    assert any(
        f.get("type") == "room.ended" and f.get("reason") == "timeout"
        for f in received
    ), received
