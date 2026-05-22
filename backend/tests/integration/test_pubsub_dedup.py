"""Integration test for cross-process pub/sub dedup.

Spec: a downstream subscriber sees each ``msg_id`` exactly once even if
the same payload reaches Redis twice (publisher retry, or two API
processes both publishing on the same channel during a race).

Why integration (not unit): we need a real Redis pub/sub bus to verify
that the subscriber loop in ``RedisPubSubPublisher`` correctly drops the
duplicate AFTER decode but BEFORE the handler. A unit test against
mocks can only assert intent, not the channel name actually arriving.
"""
from __future__ import annotations

import asyncio
import json
import uuid

import pytest

from app.core import metrics
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher


async def _wait_subscribed(sub: RedisPubSubPublisher) -> None:
    # The first message after SUBSCRIBE is the subscribe-ack — give Redis
    # a tick to register the channel before we publish.
    for _ in range(20):
        if sub._subscribed:
            await asyncio.sleep(0.05)
            return
        await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_duplicate_msg_id_delivered_once(flushed_redis) -> None:
    metrics.reset_all_for_tests()

    channel = "user:dedup-test"
    received: list[dict] = []

    async def handler(ch: str, payload: dict) -> None:
        received.append(payload)

    sub = RedisPubSubPublisher(flushed_redis)
    await sub.start(handler=handler, channels=[channel])
    await _wait_subscribed(sub)

    msg_id = uuid.uuid4().hex
    body = {"msg_id": msg_id, "type": "test", "n": 1}
    # Publish raw (not through .publish) so the SAME msg_id lands twice
    # — the helper would otherwise mint a fresh id on each call.
    await flushed_redis.publish(channel, json.dumps(body))
    await flushed_redis.publish(channel, json.dumps(body))

    # Give the listen loop a moment to process both arrivals.
    await asyncio.sleep(0.3)
    await sub.stop()

    assert len(received) == 1
    assert received[0]["msg_id"] == msg_id
    assert metrics.pubsub_duplicate_dropped_total.value(channel=channel) == 1


@pytest.mark.asyncio
async def test_distinct_msg_ids_both_delivered(flushed_redis) -> None:
    """Sanity: two different msg_ids on the same channel both pass."""
    metrics.reset_all_for_tests()

    channel = "user:distinct-test"
    received: list[dict] = []

    async def handler(ch: str, payload: dict) -> None:
        received.append(payload)

    sub = RedisPubSubPublisher(flushed_redis)
    await sub.start(handler=handler, channels=[channel])
    await _wait_subscribed(sub)

    await sub.publish(channel, {"type": "test", "n": 1})
    await sub.publish(channel, {"type": "test", "n": 2})

    await asyncio.sleep(0.3)
    await sub.stop()

    assert len(received) == 2
    assert {r["n"] for r in received} == {1, 2}
    assert metrics.pubsub_duplicate_dropped_total.value(channel=channel) == 0


@pytest.mark.asyncio
async def test_publish_injects_msg_id_when_caller_omits_it(
    flushed_redis,
) -> None:
    """``publish`` mints a uuid4 msg_id so downstream WS frames always
    carry the field — even if the caller (a domain service) doesn't set
    it explicitly."""
    metrics.reset_all_for_tests()

    channel = "user:inject-test"
    received: list[dict] = []

    async def handler(ch: str, payload: dict) -> None:
        received.append(payload)

    sub = RedisPubSubPublisher(flushed_redis)
    await sub.start(handler=handler, channels=[channel])
    await _wait_subscribed(sub)

    await sub.publish(channel, {"type": "test"})  # no msg_id field

    await asyncio.sleep(0.2)
    await sub.stop()

    assert len(received) == 1
    assert "msg_id" in received[0]
    assert len(received[0]["msg_id"]) == 32  # uuid4().hex
