from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any

from app.core.logging import get_logger

log = get_logger(__name__)

EventHandler = Callable[[Any], Awaitable[None]]


class EventBus:
    """Simple in-process async event dispatcher.

    Why: fan out domain events (SessionCompleted, MatchAccepted, ...) to
    multiple subscribers (achievements, leaderboard, notifications) without
    coupling them. Swap to Redis Streams / EventBridge in v2.
    """

    def __init__(self) -> None:
        self._handlers: dict[type, list[EventHandler]] = defaultdict(list)

    def subscribe(self, event_type: type, handler: EventHandler) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event: Any) -> None:
        handlers = self._handlers.get(type(event))
        if not handlers:
            return
        # Run subscribers concurrently; one handler's I/O latency no longer
        # blocks siblings. Each invocation is wrapped so an exception in one
        # cannot abort the others — same isolation guarantee as the prior
        # sequential implementation.
        await asyncio.gather(*(self._safe_invoke(h, event) for h in handlers))

    async def _safe_invoke(self, handler: EventHandler, event: Any) -> None:
        try:
            await handler(event)
        except Exception:
            # NB: cannot name the kwarg "event" — structlog uses that
            # key for the message itself, so collision raises TypeError
            # and silently swallows the underlying error.
            log.exception(
                "event_handler_failed",
                event_type=type(event).__name__,
            )
