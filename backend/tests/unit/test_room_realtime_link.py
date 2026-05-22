"""RoomRealtimeLink unit tests.

Worth testing:
- Each of the 4 room lifecycle events maps to exactly one WS frame
  on ``room:{room_id}`` with the expected ``type`` + payload fields.
- The link does not double-publish — registering once subscribes one
  handler per event type.

NOT worth testing:
- The Redis publish side — covered by the integration tests that
  exercise the live Redis container.
"""
from __future__ import annotations

import pytest

from app.core.events import EventBus
from app.domain.events import (
    RoomEnded,
    RoomOpened,
    RoomParticipantJoined,
    RoomReady,
)
from app.domain.services.room_realtime_link import RoomRealtimeLink
from tests.unit.fakes import RecordingPublisher


@pytest.fixture
def link_and_pub() -> tuple[RoomRealtimeLink, EventBus, RecordingPublisher]:
    bus = EventBus()
    pub = RecordingPublisher()
    link = RoomRealtimeLink(publisher=pub)
    link.register(bus)
    return link, bus, pub


@pytest.mark.asyncio
async def test_room_opened_publishes_frame_with_participants(
    link_and_pub: tuple[RoomRealtimeLink, EventBus, RecordingPublisher],
) -> None:
    _, bus, pub = link_and_pub
    await bus.publish(
        RoomOpened(
            room_id="r-1",
            match_id="m-1",
            requester_id="u-alice",
            candidate_id="u-bob",
        )
    )
    assert pub.published == [
        (
            "room:r-1",
            {
                "type": "room.opened",
                "room_id": "r-1",
                "match_id": "m-1",
                "requester_id": "u-alice",
                "candidate_id": "u-bob",
            },
        )
    ]


@pytest.mark.asyncio
async def test_participant_joined_publishes_partner_joined(
    link_and_pub: tuple[RoomRealtimeLink, EventBus, RecordingPublisher],
) -> None:
    _, bus, pub = link_and_pub
    await bus.publish(RoomParticipantJoined(room_id="r-1", user_id="u-alice"))
    assert pub.published[-1] == (
        "room:r-1",
        {"type": "room.partner_joined", "room_id": "r-1", "user_id": "u-alice"},
    )


@pytest.mark.asyncio
async def test_room_ready_publishes_ready_frame(
    link_and_pub: tuple[RoomRealtimeLink, EventBus, RecordingPublisher],
) -> None:
    _, bus, pub = link_and_pub
    await bus.publish(RoomReady(room_id="r-1"))
    assert pub.published[-1] == (
        "room:r-1",
        {"type": "room.ready", "room_id": "r-1"},
    )


@pytest.mark.asyncio
async def test_room_ended_carries_reason(
    link_and_pub: tuple[RoomRealtimeLink, EventBus, RecordingPublisher],
) -> None:
    _, bus, pub = link_and_pub
    await bus.publish(RoomEnded(room_id="r-1", reason="timeout"))
    assert pub.published[-1] == (
        "room:r-1",
        {"type": "room.ended", "room_id": "r-1", "reason": "timeout"},
    )


@pytest.mark.asyncio
async def test_publishes_exactly_once_per_event(
    link_and_pub: tuple[RoomRealtimeLink, EventBus, RecordingPublisher],
) -> None:
    _, bus, pub = link_and_pub
    await bus.publish(RoomReady(room_id="r-1"))
    assert len(pub.published) == 1
