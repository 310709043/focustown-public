from __future__ import annotations

from app.core.events import EventBus
from app.domain.events.room import (
    RoomEnded,
    RoomOpened,
    RoomParticipantJoined,
    RoomReady,
)
from app.domain.repositories.realtime import IRealtimePublisher


class RoomRealtimeLink:
    """Bridges in-process room lifecycle events to the ``room:{id}`` channel.

    Phase 07 introduced the room state machine but kept it pull-only: each
    client had to poll ``GET /rooms/match/{match_id}`` to notice the partner
    arrived. Phase 08 pushes every transition over Redis pub/sub so both
    sides see partner join / ready / ended within one network hop.

    Channel + payload contract (frontend ``focusRoomStore`` parses these):

        channel ``room:{room_id}`` → {type: "room.opened", ...}
        channel ``room:{room_id}`` → {type: "room.partner_joined", ...}
        channel ``room:{room_id}`` → {type: "room.ready", room_id}
        channel ``room:{room_id}`` → {type: "room.ended", room_id, reason}

    ``msg_id`` is auto-injected by ``RedisPubSubPublisher.publish`` and used
    by Phase 05's per-channel LRU dedup — handlers here never set it.

    DIP: depends on the narrow ``IRealtimePublisher`` port only; tests feed
    a fake publisher and assert (channel, payload) tuples.
    """

    def __init__(self, *, publisher: IRealtimePublisher) -> None:
        self._publisher = publisher

    def register(self, bus: EventBus) -> None:
        bus.subscribe(RoomOpened, self._on_opened)
        bus.subscribe(RoomParticipantJoined, self._on_joined)
        bus.subscribe(RoomReady, self._on_ready)
        bus.subscribe(RoomEnded, self._on_ended)

    async def _on_opened(self, event: RoomOpened) -> None:
        await self._publisher.publish(
            IRealtimePublisher.room_channel(event.room_id),
            {
                "type": "room.opened",
                "room_id": event.room_id,
                "match_id": event.match_id,
                "requester_id": event.requester_id,
                "candidate_id": event.candidate_id,
            },
        )

    async def _on_joined(self, event: RoomParticipantJoined) -> None:
        await self._publisher.publish(
            IRealtimePublisher.room_channel(event.room_id),
            {
                "type": "room.partner_joined",
                "room_id": event.room_id,
                "user_id": event.user_id,
            },
        )

    async def _on_ready(self, event: RoomReady) -> None:
        await self._publisher.publish(
            IRealtimePublisher.room_channel(event.room_id),
            {
                "type": "room.ready",
                "room_id": event.room_id,
            },
        )

    async def _on_ended(self, event: RoomEnded) -> None:
        await self._publisher.publish(
            IRealtimePublisher.room_channel(event.room_id),
            {
                "type": "room.ended",
                "room_id": event.room_id,
                "reason": event.reason,
            },
        )
