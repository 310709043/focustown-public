from __future__ import annotations

import asyncio
import json
import uuid
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis

from app.core.logging import get_logger
from app.core.metrics import pubsub_duplicate_dropped_total
from app.domain.repositories.realtime import IRealtimePublisher

log = get_logger(__name__)

OnMessage = Callable[[str, dict[str, Any]], Awaitable[None]]

# Per-channel LRU window — bounded so a hot channel can't grow
# unbounded. 1000 is far above any plausible burst between two
# duplicates from the same producer.
_DEDUP_WINDOW = 1000


class RedisPubSubPublisher(IRealtimePublisher):
    """Concrete fan-out using Redis Pub/Sub.

    Same instance is also used as a subscriber bridge: connect once per
    process and dispatch arrivals to the in-process WSManager.

    Every published payload carries a ``msg_id`` (uuid4 hex). On the
    subscribe side, a per-channel LRU window drops any repeat msg_id —
    so a flaky reconnect or a multi-process publisher race delivers each
    frame to downstream consumers exactly once per channel per process.
    """

    def __init__(self, redis: Redis) -> None:
        self._r = redis
        self._task: asyncio.Task[None] | None = None
        self._handler: OnMessage | None = None
        self._pubsub = None
        self._subscribed: set[str] = set()
        self._seen: dict[str, OrderedDict[str, None]] = {}

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
        # Preserve any msg_id the caller already set (idempotent retries
        # use a stable id) — otherwise mint a fresh one. Field lives at
        # the top of the dict so subscribers can pluck it without
        # parsing the whole body.
        if "msg_id" not in payload:
            payload = {"msg_id": uuid.uuid4().hex, **payload}
        await self._r.publish(channel, json.dumps(payload))

    async def start(self, *, handler: OnMessage, channels: list[str]) -> None:
        if self._task is not None:
            return
        self._handler = handler
        self._pubsub = self._r.pubsub()
        if channels:
            await self._pubsub.subscribe(*channels)
            self._subscribed.update(channels)
        self._task = asyncio.create_task(self._loop())

    async def add_channels(self, channels: list[str]) -> None:
        # Subscribe on the SAME pubsub object started in start(); otherwise
        # the listen loop never sees messages on the newly-added channels.
        if not channels or self._pubsub is None:
            return
        new = [c for c in channels if c not in self._subscribed]
        if not new:
            return
        await self._pubsub.subscribe(*new)
        self._subscribed.update(new)

    async def remove_channels(self, channels: list[str]) -> None:
        # Mirror of ``add_channels`` for explicit unsubscribes (Phase 08
        # adds the ``room:{id}`` subscribe op on focus mount and the
        # matching unsubscribe on unmount). Idempotent — a channel the
        # caller never subscribed to is a no-op.
        if not channels or self._pubsub is None:
            return
        present = [c for c in channels if c in self._subscribed]
        if not present:
            return
        await self._pubsub.unsubscribe(*present)
        self._subscribed.difference_update(present)

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        if self._pubsub is not None:
            try:
                await self._pubsub.unsubscribe()
            except Exception:
                pass
            self._pubsub = None

    def _is_duplicate(self, channel: str, msg_id: str | None) -> bool:
        if not msg_id:
            return False
        seen = self._seen.setdefault(channel, OrderedDict())
        if msg_id in seen:
            seen.move_to_end(msg_id)
            return True
        seen[msg_id] = None
        if len(seen) > _DEDUP_WINDOW:
            seen.popitem(last=False)
        return False

    async def _loop(self) -> None:
        assert self._pubsub is not None
        try:
            async for raw in self._pubsub.listen():
                if raw.get("type") != "message":
                    continue
                channel = raw.get("channel", "")
                try:
                    payload = json.loads(raw.get("data", "{}"))
                except json.JSONDecodeError:
                    log.warning("pubsub_bad_json", channel=channel)
                    continue
                if self._is_duplicate(channel, payload.get("msg_id")):
                    pubsub_duplicate_dropped_total.labels(channel=channel).inc()
                    continue
                if self._handler is not None:
                    try:
                        await self._handler(channel, payload)
                    except Exception:
                        log.exception("pubsub_handler_failed", channel=channel)
        except asyncio.CancelledError:
            raise
