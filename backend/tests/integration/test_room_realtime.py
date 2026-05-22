"""Integration test for Phase 08 — room lifecycle events → room.* WS frames.

What this pins:
- ``RoomRealtimeLink`` registered on the bus translates every domain
  event into the matching ``room.*`` frame on ``room:{room_id}``
  with the expected payload.
- ``RoomTimerService.tick`` emits ``room.timer_tick`` frames with
  monotonic elapsed values via the live Redis pub/sub bus.

Why integration (not unit): the unit tests in
``test_room_realtime_link.py`` + ``test_room_timer_service.py`` already
cover the in-process flow. This test pins that the Redis pub/sub
delivery path is wired correctly end-to-end — domain event publish
→ Redis PUBLISH → subscriber callback fires with the same payload.
"""
from __future__ import annotations

import asyncio

import pytest

from app.core.clock import SystemClock
from app.core.events import EventBus
from app.domain.events import (
    RoomEnded,
    RoomOpened,
    RoomParticipantJoined,
    RoomReady,
)
from app.domain.services.room_realtime_link import RoomRealtimeLink
from app.domain.services.room_timer_service import RoomTimerService
from app.infrastructure.cache.room_timer_store import RedisRoomTimerStore
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher

pytestmark = pytest.mark.asyncio


async def _wait_subscribed(sub: RedisPubSubPublisher) -> None:
    # Mirror of the pattern from test_pubsub_dedup — give the SUBSCRIBE
    # round-trip a tick before publishing so the first message isn't lost.
    for _ in range(20):
        if sub._subscribed:
            await asyncio.sleep(0.05)
            return
        await asyncio.sleep(0.05)


async def _gather_room_frames(
    flushed_redis, room_id: str, *, count: int, timeout: float = 2.0  # noqa: ASYNC109 — wait deadline, not an HTTP timeout
) -> list[dict]:
    """Subscribe to ``room:{room_id}`` and wait for ``count`` frames or
    ``timeout`` seconds, whichever first."""
    channel = f"room:{room_id}"
    received: list[dict] = []
    done = asyncio.Event()

    async def handler(_ch: str, payload: dict) -> None:
        received.append(payload)
        if len(received) >= count:
            done.set()

    sub = RedisPubSubPublisher(flushed_redis)
    await sub.start(handler=handler, channels=[channel])
    try:
        await _wait_subscribed(sub)
        try:
            await asyncio.wait_for(done.wait(), timeout=timeout)
        except TimeoutError:
            pass
    finally:
        await sub.stop()
    return received


async def test_room_opened_event_emits_ws_frame(flushed_redis) -> None:
    bus = EventBus()
    RoomRealtimeLink(publisher=RedisPubSubPublisher(flushed_redis)).register(bus)

    async def emit() -> None:
        # Tiny lead so the subscriber is listening before we publish.
        await asyncio.sleep(0.1)
        await bus.publish(
            RoomOpened(
                room_id="r-1",
                match_id="m-1",
                requester_id="u-alice",
                candidate_id="u-bob",
            )
        )

    frames_task = asyncio.create_task(
        _gather_room_frames(flushed_redis, "r-1", count=1)
    )
    await emit()
    frames = await frames_task

    assert len(frames) == 1
    assert frames[0]["type"] == "room.opened"
    assert frames[0]["requester_id"] == "u-alice"
    assert frames[0]["candidate_id"] == "u-bob"


async def test_room_ready_event_emits_ws_frame(flushed_redis) -> None:
    bus = EventBus()
    RoomRealtimeLink(publisher=RedisPubSubPublisher(flushed_redis)).register(bus)

    async def emit() -> None:
        await asyncio.sleep(0.1)
        await bus.publish(RoomParticipantJoined(room_id="r-2", user_id="u-x"))
        await bus.publish(RoomReady(room_id="r-2"))

    frames_task = asyncio.create_task(
        _gather_room_frames(flushed_redis, "r-2", count=2)
    )
    await emit()
    frames = await frames_task

    types = [f["type"] for f in frames]
    assert "room.partner_joined" in types
    assert "room.ready" in types


async def test_room_ended_carries_reason(flushed_redis) -> None:
    bus = EventBus()
    RoomRealtimeLink(publisher=RedisPubSubPublisher(flushed_redis)).register(bus)

    async def emit() -> None:
        await asyncio.sleep(0.1)
        await bus.publish(RoomEnded(room_id="r-3", reason="timeout"))

    frames_task = asyncio.create_task(
        _gather_room_frames(flushed_redis, "r-3", count=1)
    )
    await emit()
    frames = await frames_task

    assert len(frames) == 1
    assert frames[0]["type"] == "room.ended"
    assert frames[0]["reason"] == "timeout"


async def test_timer_tick_emits_remaining_seconds(flushed_redis) -> None:
    timer = RoomTimerService(
        store=RedisRoomTimerStore(flushed_redis),
        publisher=RedisPubSubPublisher(flushed_redis),
        clock=SystemClock(),
    )

    async def emit() -> None:
        await asyncio.sleep(0.1)
        await timer.session_started(
            room_id="r-tick",
            started_at=SystemClock().now(),
            duration_seconds=600,
        )
        await timer.tick("r-tick")

    frames_task = asyncio.create_task(
        _gather_room_frames(flushed_redis, "r-tick", count=2)
    )
    await emit()
    frames = await frames_task

    types = [f["type"] for f in frames]
    assert "room.session_started" in types
    assert "room.timer_tick" in types
    tick = next(f for f in frames if f["type"] == "room.timer_tick")
    # Just enough to confirm the math reached the wire — exact values
    # depend on host timing.
    assert tick["remaining_seconds"] <= 600
    assert tick["elapsed_seconds"] >= 0
