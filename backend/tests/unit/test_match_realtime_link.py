from __future__ import annotations

import pytest

from app.core.events import EventBus
from app.domain.events.match import MatchAccepted, MatchProposed
from app.domain.services.match_realtime_link import MatchRealtimeLink
from tests.unit.fakes import RecordingPublisher


@pytest.mark.asyncio
async def test_match_proposed_publishes_to_candidate_channel() -> None:
    publisher = RecordingPublisher()
    bus = EventBus()
    MatchRealtimeLink(publisher=publisher).register(bus)

    await bus.publish(
        MatchProposed(
            match_id="m1",
            requester_id="u-alice",
            candidate_id="u-bob",
            compatibility=78,
        )
    )

    assert publisher.published == [
        (
            "user:u-bob",
            {
                "type": "match.proposed",
                "match_id": "m1",
                "from": "u-alice",
                "compatibility": 78,
            },
        )
    ]


@pytest.mark.asyncio
async def test_match_proposed_does_not_notify_requester() -> None:
    """The requester already learned about the match via the HTTP response;
    double-notifying them would race the modal-open they did locally."""
    publisher = RecordingPublisher()
    bus = EventBus()
    MatchRealtimeLink(publisher=publisher).register(bus)

    await bus.publish(
        MatchProposed(
            match_id="m1",
            requester_id="u-alice",
            candidate_id="u-bob",
            compatibility=78,
        )
    )

    channels = [c for c, _ in publisher.published]
    assert "user:u-alice" not in channels


@pytest.mark.asyncio
async def test_match_accepted_notifies_both_sides() -> None:
    publisher = RecordingPublisher()
    bus = EventBus()
    MatchRealtimeLink(publisher=publisher).register(bus)

    await bus.publish(
        MatchAccepted(
            match_id="m1",
            requester_id="u-alice",
            candidate_id="u-bob",
        )
    )

    assert publisher.published == [
        ("user:u-alice", {"type": "match.accepted", "match_id": "m1"}),
        ("user:u-bob", {"type": "match.accepted", "match_id": "m1"}),
    ]


@pytest.mark.asyncio
async def test_no_events_published_before_a_match_event_is_emitted() -> None:
    """Object-state guard: instantiating + registering shouldn't fire
    anything on its own — the link is purely reactive."""
    publisher = RecordingPublisher()
    bus = EventBus()
    MatchRealtimeLink(publisher=publisher).register(bus)

    assert publisher.published == []
