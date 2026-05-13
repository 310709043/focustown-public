from __future__ import annotations

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
        for handler in self._handlers.get(type(event), []):
            try:
                await handler(event)
            except Exception:
                log.exception("event_handler_failed", event=type(event).__name__)
