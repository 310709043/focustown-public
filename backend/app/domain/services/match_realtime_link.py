from __future__ import annotations

from app.core.events import EventBus
from app.domain.events.match import MatchAccepted, MatchProposed
from app.domain.repositories.realtime import IRealtimePublisher


class MatchRealtimeLink:
    """Bridges in-process match events to per-user WS channels.

    Without this link `MatchingService.propose()` raises a domain event
    that no one listens for, so the *candidate* never sees the proposal
    on their WebSocket and the receiver-side MatchModal never opens —
    even though the API call from the requester succeeds. Mirrors the
    pattern used by ``SessionPresenceLink`` for the focus-session
    lifecycle.

    Channel + payload contract (matches what ``useRealtimeMatch`` in the
    frontend already parses):

        channel ``user:{candidate_id}``    →   {type, match_id, from, compatibility}
        channel ``user:{requester_id}``    →   {type, match_id}  (for "accepted")

    DIP: depends on the narrow ``IRealtimePublisher`` port only; tests
    feed a fake publisher and assert (channel, payload) tuples.
    """

    def __init__(self, *, publisher: IRealtimePublisher) -> None:
        self._publisher = publisher

    def register(self, bus: EventBus) -> None:
        bus.subscribe(MatchProposed, self._on_proposed)
        bus.subscribe(MatchAccepted, self._on_accepted)

    async def _on_proposed(self, event: MatchProposed) -> None:
        # Notify the candidate (the recipient of the proposal). The
        # requester already learned about the match via the HTTP
        # response, so we don't double-notify them here.
        await self._publisher.publish(
            f"user:{event.candidate_id}",
            {
                "type": "match.proposed",
                "match_id": event.match_id,
                "from": event.requester_id,
                "compatibility": event.compatibility,
            },
        )

    async def _on_accepted(self, event: MatchAccepted) -> None:
        # Notify BOTH sides so each can transition into the shared
        # focus room. Sending to both is idempotent: a client that
        # already navigated still no-ops on the message.
        payload = {"type": "match.accepted", "match_id": event.match_id}
        for uid in (event.requester_id, event.candidate_id):
            await self._publisher.publish(f"user:{uid}", payload)
