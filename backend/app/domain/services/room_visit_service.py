from __future__ import annotations

from dataclasses import dataclass

from app.core.exceptions import (
    BusinessError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.core.ids import IIdGenerator
from app.domain.models.room_visit import RoomVisit
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.room_repo import IRoomRepo
from app.domain.repositories.room_visit_repo import (
    IRoomVisitReader,
    IRoomVisitWriter,
)
from app.domain.services.presence_service import PresenceService


@dataclass(slots=True)
class RoomVisitService:
    """Per-room visitor session lifecycle.

    SOLID:
    - S: only handles "who is currently in this room" — does NOT touch
      room CRUD, decoration items, or playlist. ``RoomService`` keeps
      owning room metadata, ``RoomDecorationService`` owns items,
      ``RoomTrackService`` owns playlist.
    - D: depends on Protocols (``IRoomRepo``, ``IRoomVisitReader``,
      ``IRoomVisitWriter``, ``IRealtimePublisher``, ``IIdGenerator``)
      and the existing ``PresenceService`` for the state-mutation
      facade. No SQLAlchemy or FastAPI types crossed.
    - I: visit-repo deps narrowed to Reader / Writer facets. The room
      side stays on ``IRoomRepo`` for parity with the other room
      services in this codebase (a future refactor can narrow it).

    Three permission gates (in order):
      1. room exists
      2. visibility — public OR caller is owner (mirrors the Phase 5
         widening in ``RoomService.get_by_id``)
      3. capacity — non-owner visits count against ``room.max_visitors``;
         the owner can always enter their own room
    """

    rooms: IRoomRepo
    visit_reader: IRoomVisitReader
    visit_writer: IRoomVisitWriter
    presence: PresenceService
    realtime: IRealtimePublisher
    id_gen: IIdGenerator

    async def visit(
        self, *, room_id: str, user_id: str
    ) -> RoomVisit:
        room = await self.rooms.get_by_id(room_id)
        if room is None:
            raise NotFoundError("room_not_found")
        if (
            room.owner_user_id != user_id
            and room.visibility == "invite_only"
        ):
            raise ForbiddenError("room_not_accessible")

        # Capacity gate — owner-in-own-room is always allowed.
        if room.owner_user_id != user_id:
            current = await self.visit_reader.count_by_room(room_id)
            if current >= room.max_visitors:
                raise BusinessError("room_full")

        # Auto-leave any prior visit (a user is in at most one room).
        prior = await self.visit_reader.get_by_user(user_id)
        if prior is not None:
            if prior.room_id == room_id:
                # Idempotent revisit — keep the existing row, just refresh
                # presence + broadcast in case the WS state drifted.
                await self.presence.set_state(user_id, "in_room")
                return prior
            await self.visit_writer.delete(prior.id)
            await self.realtime.publish(
                IRealtimePublisher.room_channel(prior.room_id),
                {
                    "type": "room.visitor_left",
                    "room_id": prior.room_id,
                    "user_id": user_id,
                },
            )

        try:
            row = await self.visit_writer.create(
                visit_id=self.id_gen.new_id(),
                room_id=room_id,
                visitor_user_id=user_id,
            )
        except ConflictError:
            # UNIQUE(visitor_user_id) raced — re-read and treat as
            # idempotent. The auto-leave above should have prevented
            # this, but a concurrent visit from a second tab could
            # still trigger it.
            again = await self.visit_reader.get_by_user(user_id)
            if again is None or again.room_id != room_id:
                raise
            row = again

        await self.presence.set_state(user_id, "in_room")
        await self.realtime.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "room.visitor_joined",
                "room_id": room_id,
                "user_id": user_id,
                "joined_at": row.joined_at.isoformat(),
            },
        )
        return row

    async def leave(self, *, room_id: str, user_id: str) -> None:
        existing = await self.visit_reader.get_by_user(user_id)
        if existing is None or existing.room_id != room_id:
            # Idempotent: the user is not currently in this room. Caller
            # can retry without us complaining.
            return
        await self.visit_writer.delete(existing.id)
        await self.presence.set_state(user_id, "on_street")
        await self.realtime.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "room.visitor_left",
                "room_id": room_id,
                "user_id": user_id,
            },
        )

    async def list_visitors(
        self, *, room_id: str, requester_user_id: str
    ) -> list[RoomVisit]:
        room = await self.rooms.get_by_id(room_id)
        if room is None:
            raise NotFoundError("room_not_found")
        if (
            room.owner_user_id != requester_user_id
            and room.visibility == "invite_only"
        ):
            raise ForbiddenError("room_not_accessible")
        return await self.visit_reader.list_by_room(room_id)
