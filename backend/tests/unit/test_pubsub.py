"""Unit tests for ``RedisPubSubPublisher``.

Worth testing (behaviour the WS bridge depends on):

- ``publish`` JSON-encodes the payload and forwards exactly the bytes
  any other connected process can decode.
- ``add_channels`` deduplicates against the already-subscribed set —
  re-subscribing the same channel is a no-op, otherwise a noisy room
  switch would multiplex N times.
- ``add_channels`` is a no-op before ``start`` (no pubsub object yet)
  so a router that forgets to call ``start`` doesn't crash.
- ``start`` is idempotent — second call is a no-op so a reconnect race
  cannot stand up two listen loops on the same WS.
- ``stop`` survives both the "started, then stopped" and "never
  started" paths without raising.

NOT worth testing here:
- The Redis driver itself — that's a third-party contract.
- The listen loop's JSON-decoding error path — covered indirectly by
  the WS router integration tests.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.infrastructure.messaging.pubsub import RedisPubSubPublisher


def _fake_redis_with_pubsub() -> tuple[MagicMock, MagicMock]:
    """Return (redis, pubsub) with the methods RedisPubSubPublisher touches."""
    pubsub = MagicMock()
    pubsub.subscribe = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    redis = MagicMock()
    redis.publish = AsyncMock()
    redis.pubsub = MagicMock(return_value=pubsub)
    return redis, pubsub


# ── logic — publish ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_publish_forwards_json_encoded_payload() -> None:
    redis, _ = _fake_redis_with_pubsub()
    pub = RedisPubSubPublisher(redis)

    await pub.publish("user:alice", {"type": "match.proposed", "id": "m-1"})

    # Single call, channel as positional, JSON string as positional.
    redis.publish.assert_awaited_once()
    args = redis.publish.await_args.args
    assert args[0] == "user:alice"
    assert json.loads(args[1]) == {"type": "match.proposed", "id": "m-1"}


# ── logic + object-state — add_channels dedup ──────────────────────────────


@pytest.mark.asyncio
async def test_add_channels_subscribes_only_new_channels() -> None:
    redis, pubsub = _fake_redis_with_pubsub()
    pub = RedisPubSubPublisher(redis)
    # Stand up the pubsub object via start() so add_channels has somewhere
    # to subscribe against. The listen-loop task is irrelevant here.
    await pub.start(handler=AsyncMock(), channels=["a"])
    pubsub.subscribe.reset_mock()

    # 'a' is already subscribed; only 'b' should land at the driver.
    await pub.add_channels(["a", "b"])

    pubsub.subscribe.assert_awaited_once_with("b")
    await pub.stop()


@pytest.mark.asyncio
async def test_add_channels_before_start_is_noop() -> None:
    redis, pubsub = _fake_redis_with_pubsub()
    pub = RedisPubSubPublisher(redis)

    # No exception, no subscribe — callers that forget to start() get a
    # silent no-op, not a crash that takes down their WS handler.
    await pub.add_channels(["a"])

    pubsub.subscribe.assert_not_awaited()


@pytest.mark.asyncio
async def test_add_channels_empty_list_is_noop() -> None:
    redis, pubsub = _fake_redis_with_pubsub()
    pub = RedisPubSubPublisher(redis)
    await pub.start(handler=AsyncMock(), channels=["a"])
    pubsub.subscribe.reset_mock()

    await pub.add_channels([])

    pubsub.subscribe.assert_not_awaited()
    await pub.stop()


# ── object-state — start / stop lifecycle ──────────────────────────────────


@pytest.mark.asyncio
async def test_start_twice_does_not_create_a_second_listen_loop() -> None:
    redis, pubsub = _fake_redis_with_pubsub()
    pub = RedisPubSubPublisher(redis)

    await pub.start(handler=AsyncMock(), channels=["a"])
    pubsub.subscribe.reset_mock()
    await pub.start(handler=AsyncMock(), channels=["b"])

    # Second start: no extra subscribe; the same pubsub object stands.
    pubsub.subscribe.assert_not_awaited()
    await pub.stop()


@pytest.mark.asyncio
async def test_stop_without_start_is_safe() -> None:
    redis, _ = _fake_redis_with_pubsub()
    pub = RedisPubSubPublisher(redis)

    # Defensive cleanup at WS disconnect time — even if start was never
    # reached (early auth failure before pub.start()), stop must not blow.
    await pub.stop()


@pytest.mark.asyncio
async def test_stop_after_start_unsubscribes_and_clears_pubsub() -> None:
    redis, pubsub = _fake_redis_with_pubsub()
    pub = RedisPubSubPublisher(redis)
    await pub.start(handler=AsyncMock(), channels=["a"])

    await pub.stop()

    pubsub.unsubscribe.assert_awaited()
    # Second stop is still safe.
    await pub.stop()
