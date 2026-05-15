from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

PresenceState = Literal["on_street", "in_room", "offline"]
"""Where a connected user currently is.

- ``on_street``: connected, default — shows up on the town street view
- ``in_room``: connected but visiting a room (Phase 8 onward) — hidden from street
- ``offline``: not connected / TTL expired

The enum is shared by Phase 1 (street) and Phase 8 (room visit); Phase 1 only
emits ``on_street`` and ``offline``, but the type is forward-compatible.
"""


@dataclass(slots=True, frozen=True)
class PresenceEntry:
    user_id: str
    state: PresenceState
    status: str
    last_seen_at: datetime


class IPresenceTracker(Protocol):
    """Port for tracking which users are connected and where they are.

    Implementations must be safe to call concurrently from multiple processes
    (Phase 10 will scale horizontally). The MVP impl is Redis-backed; an
    in-memory fake exists in tests.
    """

    async def online(
        self,
        user_id: str,
        *,
        state: PresenceState = "on_street",
        status: str = "afk",
    ) -> None: ...

    async def offline(self, user_id: str) -> None: ...

    async def update(
        self,
        user_id: str,
        *,
        state: PresenceState | None = None,
        status: str | None = None,
    ) -> None: ...

    async def get(self, user_id: str) -> PresenceEntry | None: ...

    async def list(
        self, *, state: PresenceState | None = None
    ) -> list[PresenceEntry]: ...


class IPresenceStatusWriter(Protocol):
    """Narrow Writer port for components that only need to publish a status
    change (e.g. the EventBus → presence subscriber).

    Interface Segregation: depending on this Protocol (rather than the full
    ``PresenceService``) means subscribers cannot accidentally call
    ``connect`` / ``disconnect`` / ``list_street`` — methods outside their
    responsibility. ``PresenceService.set_status`` already satisfies the
    contract structurally; no explicit subclassing is required.
    """

    async def set_status(self, user_id: str, status: str) -> None: ...
