"""RoomTimerService unit tests.

Worth testing:
- session_started writes the store entry AND publishes a
  ``room.session_started`` frame with the start timestamp + duration.
- tick reads the store and publishes a ``room.timer_tick`` frame whose
  elapsed/remaining match what the fake clock implies.
- tick after the duration elapsed returns False (signals the worker to
  wind the room down) and still publishes the last 0-remaining frame.
- session_completed publishes ``room.session_completed`` and removes
  the store entry.
- peek is a pure read — no publish, returns None on missing entry.

NOT worth testing:
- The Redis hash adapter — covered by the integration tests that
  exercise the live Redis container.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.services.room_timer_service import (
    IRoomTimerStore,
    RoomTimerService,
)
from tests.unit.fakes import FakeClock, RecordingPublisher


@dataclass
class FakeRoomTimerStore(IRoomTimerStore):
    """Mirrors the Redis hash contract — write / read / delete keyed by
    room_id with no TTL enforcement (clock-driven elapsed is what the
    tests assert on)."""

    rows: dict[str, dict[str, str]] = field(default_factory=dict)
    write_calls: list[dict] = field(default_factory=list)

    async def write(
        self,
        *,
        room_id: str,
        started_at_ms: int,
        duration_seconds: int,
        ttl_seconds: int,
    ) -> None:
        self.rows[room_id] = {
            "started_at_ms": str(started_at_ms),
            "duration_seconds": str(duration_seconds),
        }
        self.write_calls.append(
            {
                "room_id": room_id,
                "started_at_ms": started_at_ms,
                "duration_seconds": duration_seconds,
                "ttl_seconds": ttl_seconds,
            }
        )

    async def read(self, room_id: str) -> dict[str, str] | None:
        return self.rows.get(room_id)

    async def delete(self, room_id: str) -> None:
        self.rows.pop(room_id, None)


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock(current=datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC))


@pytest.fixture
def store() -> FakeRoomTimerStore:
    return FakeRoomTimerStore()


@pytest.fixture
def publisher() -> RecordingPublisher:
    return RecordingPublisher()


@pytest.fixture
def service(
    store: FakeRoomTimerStore,
    publisher: RecordingPublisher,
    fake_clock: FakeClock,
) -> RoomTimerService:
    return RoomTimerService(store=store, publisher=publisher, clock=fake_clock)


@pytest.mark.asyncio
async def test_session_started_writes_store_and_publishes_frame(
    service: RoomTimerService,
    store: FakeRoomTimerStore,
    publisher: RecordingPublisher,
    fake_clock: FakeClock,
) -> None:
    await service.session_started(
        room_id="r-1",
        started_at=fake_clock.now(),
        duration_seconds=600,
    )
    # Store entry persisted with the canonical fields.
    assert "r-1" in store.rows
    assert int(store.rows["r-1"]["duration_seconds"]) == 600
    # And the wire frame matches the contract — channel + type + payload.
    channel, payload = publisher.published[-1]
    assert channel == "room:r-1"
    assert payload["type"] == "room.session_started"
    assert payload["duration_seconds"] == 600


@pytest.mark.asyncio
async def test_session_started_sets_ttl_with_grace(
    service: RoomTimerService,
    store: FakeRoomTimerStore,
    fake_clock: FakeClock,
) -> None:
    await service.session_started(
        room_id="r-1",
        started_at=fake_clock.now(),
        duration_seconds=600,
    )
    # 600s duration + 60s grace == 660s TTL ceiling.
    assert store.write_calls[-1]["ttl_seconds"] == 660


@pytest.mark.asyncio
async def test_tick_publishes_elapsed_and_remaining(
    service: RoomTimerService,
    publisher: RecordingPublisher,
    fake_clock: FakeClock,
) -> None:
    await service.session_started(
        room_id="r-1",
        started_at=fake_clock.now(),
        duration_seconds=600,
    )
    fake_clock.advance(timedelta(seconds=30))
    publisher.published.clear()  # focus the assert on the tick frame

    still_live = await service.tick("r-1")

    assert still_live is True
    channel, payload = publisher.published[-1]
    assert channel == "room:r-1"
    assert payload["type"] == "room.timer_tick"
    assert payload["elapsed_seconds"] == 30
    assert payload["remaining_seconds"] == 570


@pytest.mark.asyncio
async def test_tick_returns_false_when_duration_elapsed(
    service: RoomTimerService,
    fake_clock: FakeClock,
) -> None:
    await service.session_started(
        room_id="r-1",
        started_at=fake_clock.now(),
        duration_seconds=600,
    )
    fake_clock.advance(timedelta(seconds=601))
    assert await service.tick("r-1") is False


@pytest.mark.asyncio
async def test_tick_returns_false_when_store_missing(
    service: RoomTimerService,
) -> None:
    assert await service.tick("never-started") is False


@pytest.mark.asyncio
async def test_session_completed_publishes_and_deletes(
    service: RoomTimerService,
    store: FakeRoomTimerStore,
    publisher: RecordingPublisher,
    fake_clock: FakeClock,
) -> None:
    await service.session_started(
        room_id="r-1",
        started_at=fake_clock.now(),
        duration_seconds=600,
    )
    publisher.published.clear()

    await service.session_completed("r-1")

    assert "r-1" not in store.rows
    channel, payload = publisher.published[-1]
    assert channel == "room:r-1"
    assert payload["type"] == "room.session_completed"


@pytest.mark.asyncio
async def test_peek_returns_state_without_publishing(
    service: RoomTimerService,
    publisher: RecordingPublisher,
    fake_clock: FakeClock,
) -> None:
    await service.session_started(
        room_id="r-1",
        started_at=fake_clock.now(),
        duration_seconds=600,
    )
    publisher.published.clear()
    fake_clock.advance(timedelta(seconds=10))

    state = await service.peek("r-1")

    assert state is not None
    assert state.elapsed_seconds == 10
    assert state.remaining_seconds == 590
    # peek is a pure read — no frame should have been published.
    assert publisher.published == []


@pytest.mark.asyncio
async def test_peek_returns_none_when_missing(
    service: RoomTimerService,
) -> None:
    assert await service.peek("never-started") is None
