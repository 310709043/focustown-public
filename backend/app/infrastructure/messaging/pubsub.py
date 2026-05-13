from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis

from app.core.logging import get_logger
from app.domain.repositories.realtime import IRealtimePublisher

log = get_logger(__name__)

OnMessage = Callable[[str, dict[str, Any]], Awaitable[None]]


class RedisPubSubPublisher(IRealtimePublisher):
    """Concrete fan-out using Redis Pub/Sub.

    Same instance is also used as a subscriber bridge: connect once per
    process and dispatch arrivals to the in-process WSManager.
    """

    def __init__(self, redis: Redis) -> None:
        self._r = redis
        self._task: asyncio.Task[None] | None = None
        self._handler: OnMessage | None = None
        self._pubsub = None
        self._subscribed: set[str] = set()

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
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
                if self._handler is not None:
                    try:
                        await self._handler(channel, payload)
                    except Exception:
                        log.exception("pubsub_handler_failed", channel=channel)
        except asyncio.CancelledError:
            raise
