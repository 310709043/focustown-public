from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from app.core.clock import IClock
from app.domain.repositories.realtime import IRealtimePublisher


class IRoomTimerStore(Protocol):
    """Narrow port the timer service uses to persist per-room countdown
    state. The MVP impl is Redis-backed (HSET / HGETALL / DELETE on
    ``room:timer:{room_id}`` with a TTL); a fake impl drives the unit
    tests without touching Redis.
    """

    async def write(
        self,
        *,
        room_id: str,
        started_at_ms: int,
        duration_seconds: int,
        ttl_seconds: int,
    ) -> None: ...

    async def read(self, room_id: str) -> dict[str, str] | None: ...

    async def delete(self, room_id: str) -> None: ...


@dataclass(slots=True, frozen=True)
class TimerState:
    """In-memory projection of the persisted countdown row."""

    started_at: datetime
    duration_seconds: int
    elapsed_seconds: int
    remaining_seconds: int


# 60s grace beyond the planned duration so a crashed worker doesn't leave
# the Redis hash orphaned indefinitely — by the time the TTL fires the
# room is long over and the cleanup is a no-op.
_TTL_GRACE_SECONDS = 60


class RoomTimerService:
    """Single source of truth for the focus countdown.

    The frontend MUST NOT keep a local setInterval that decrements
    ``remaining_seconds`` — drift between two browsers compounds visibly
    inside 30s. ``room.timer_tick`` frames from this service are the
    canonical value; the UI snaps to it on every tick.

    State lives in a Redis hash keyed by ``room:timer:{room_id}``:
        started_at_ms: int (server clock, ms epoch)
        duration_seconds: int

    Stays in domain/services/ — depends only on the narrow store + publisher
    ports plus the shared clock, never the redis client directly. That
    keeps the layering clean and lets tests drop in fakes.
    """

    def __init__(
        self,
        *,
        store: IRoomTimerStore,
        publisher: IRealtimePublisher,
        clock: IClock,
    ) -> None:
        self._store = store
        self._publisher = publisher
        self._clock = clock

    async def session_started(
        self,
        *,
        room_id: str,
        started_at: datetime,
        duration_seconds: int,
    ) -> None:
        """Stamp the countdown start + emit the first ``room.session_started``
        frame. Idempotent at the store level; callers (``MatchRoomService.
        start_session``) guard against double-firing via the room status."""
        started_at_ms = int(started_at.timestamp() * 1000)
        await self._store.write(
            room_id=room_id,
            started_at_ms=started_at_ms,
            duration_seconds=duration_seconds,
            ttl_seconds=duration_seconds + _TTL_GRACE_SECONDS,
        )
        await self._publisher.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "room.session_started",
                "room_id": room_id,
                "started_at": started_at_ms,
                "duration_seconds": duration_seconds,
            },
        )

    async def tick(self, room_id: str) -> bool:
        """Publish one ``room.timer_tick`` frame for ``room_id``.

        Returns ``True`` if the countdown is still live, ``False`` if the
        store has nothing (room never started, already cleaned up) or the
        countdown has reached zero — caller (worker) treats False as the
        signal to wind the room down.
        """
        state = await self.peek(room_id)
        if state is None:
            return False
        await self._publisher.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "room.timer_tick",
                "room_id": room_id,
                "elapsed_seconds": state.elapsed_seconds,
                "remaining_seconds": state.remaining_seconds,
            },
        )
        return state.remaining_seconds > 0

    async def session_completed(self, room_id: str) -> None:
        """Terminal — publish ``room.session_completed`` and drop the store
        entry. Idempotent: a second call still publishes (cheap, frame is
        deduped by ``msg_id`` window) and the delete is a no-op."""
        await self._publisher.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "room.session_completed",
                "room_id": room_id,
            },
        )
        await self._store.delete(room_id)

    async def peek(self, room_id: str) -> TimerState | None:
        """Read the countdown without publishing — used by the snapshot
        endpoint so a mid-session reload restores the timer instantly
        instead of waiting up to 1s for the next tick frame."""
        raw = await self._store.read(room_id)
        if not raw:
            return None
        try:
            started_at_ms = int(raw["started_at_ms"])
            duration_seconds = int(raw["duration_seconds"])
        except (KeyError, ValueError):
            return None
        started_at = datetime.fromtimestamp(started_at_ms / 1000, tz=UTC)
        elapsed = int((self._clock.now() - started_at).total_seconds())
        elapsed = max(0, min(elapsed, duration_seconds))
        remaining = max(0, duration_seconds - elapsed)
        return TimerState(
            started_at=started_at,
            duration_seconds=duration_seconds,
            elapsed_seconds=elapsed,
            remaining_seconds=remaining,
        )
