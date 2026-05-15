from __future__ import annotations

from app.core.events import EventBus
from app.domain.events.session import (
    SessionAbandoned,
    SessionCompleted,
    SessionStarted,
)
from app.domain.repositories.presence import IPresenceStatusWriter

_FOCUSING = "focus"
_IDLE = "afk"


class SessionPresenceLink:
    """Translates focus-session lifecycle events into presence status updates.

    Pure adapter: holds no business logic and depends only on the narrow
    ``IPresenceStatusWriter`` port (ISP). The concrete ``PresenceService``
    structurally satisfies that protocol; tests can inject a fake without
    Redis or a DB session.

    Lifecycle mapping (1 → 1):
        SessionStarted   → focus  (self + partner if matched)
        SessionCompleted → afk    (self + partner if matched)
        SessionAbandoned → afk    (self only; abandonment is one-sided)
    """

    def __init__(self, writer: IPresenceStatusWriter) -> None:
        self._writer = writer

    def register(self, bus: EventBus) -> None:
        bus.subscribe(SessionStarted, self._on_started)
        bus.subscribe(SessionCompleted, self._on_completed)
        bus.subscribe(SessionAbandoned, self._on_abandoned)

    async def _on_started(self, event: SessionStarted) -> None:
        await self._writer.set_status(event.user_id, _FOCUSING)
        if event.partner_user_id:
            await self._writer.set_status(event.partner_user_id, _FOCUSING)

    async def _on_completed(self, event: SessionCompleted) -> None:
        await self._writer.set_status(event.user_id, _IDLE)
        if event.partner_user_id:
            await self._writer.set_status(event.partner_user_id, _IDLE)

    async def _on_abandoned(self, event: SessionAbandoned) -> None:
        await self._writer.set_status(event.user_id, _IDLE)
