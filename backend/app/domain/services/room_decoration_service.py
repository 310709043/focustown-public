from __future__ import annotations

from dataclasses import dataclass

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.core.ids import IIdGenerator
from app.domain.models.room_item import MAX_PCT, MIN_PCT, RoomItem
from app.domain.repositories.room_item_repo import (
    IRoomItemReader,
    IRoomItemWriter,
)
from app.domain.repositories.room_repo import IRoomRepo
from app.domain.repositories.user_item_repo import IUserItemReader


@dataclass(slots=True)
class RoomDecorationService:
    """Owns placement / move / remove of room_items inside a single room.

    SOLID:
    - S: only handles decoration items inside a room — never touches room
      lifecycle, presence, or playback. ``RoomService`` keeps owning the
      room itself.
    - D: depends on Protocols (``IRoomRepo``, ``IRoomItemReader``,
      ``IRoomItemWriter``, ``IUserItemReader``, ``IIdGenerator``); no
      SQLAlchemy or FastAPI types crossed.
    - I: each repo dep is narrowed to its Reader / Writer facet. The room
      side stays on ``IRoomRepo`` because this service uses both a read
      (visibility check) AND would call ``rooms.update`` if it ever
      promoted a placement (not in this stint, but the door is open).

    Three permission gates run inside the service (not the router):
      1. visitor read — list_for_room allows public rooms; invite_only
         is owner-only.
      2. owner write — place / move / remove all require the requester
         to own the target room.
      3. inventory ownership — placing requires the requester to own
         the ``user_item_id`` they're trying to place.
    """

    rooms: IRoomRepo
    item_reader: IRoomItemReader
    item_writer: IRoomItemWriter
    user_items_reader: IUserItemReader
    id_gen: IIdGenerator

    async def list_for_room(
        self, *, room_id: str, requester_user_id: str
    ) -> list[RoomItem]:
        room = await self.rooms.get_by_id(room_id)
        if room is None:
            raise NotFoundError("room_not_found")
        if (
            room.owner_user_id != requester_user_id
            and room.visibility == "invite_only"
        ):
            raise ForbiddenError("room_not_accessible")
        return await self.item_reader.list_for_room(room_id)

    async def place(
        self,
        *,
        owner_user_id: str,
        user_item_id: str,
        x: int,
        y: int,
    ) -> RoomItem:
        self._validate_position(x, y)
        owned = await self.user_items_reader.get_by_id_and_owner(
            user_item_id=user_item_id,
            owner_user_id=owner_user_id,
        )
        if owned is None:
            # Either the user_item_id is unknown OR it belongs to a
            # different user. Both collapse to a single error to avoid
            # leaking inventory existence to other users.
            raise BusinessError("user_item_not_owned")

        room = await self.rooms.get_by_owner(owner_user_id)
        if room is None:
            raise NotFoundError("room_not_found")

        existing = await self.item_reader.list_for_room(room.id)
        next_z = max((it.z_index for it in existing), default=-1) + 1

        return await self.item_writer.create(
            item_id=self.id_gen.new_id(),
            room_id=room.id,
            user_item_id=user_item_id,
            x=x,
            y=y,
            z_index=next_z,
        )

    async def move(
        self,
        *,
        owner_user_id: str,
        item_id: str,
        x: int,
        y: int,
    ) -> RoomItem:
        self._validate_position(x, y)
        item = await self.item_reader.get(item_id)
        if item is None:
            raise NotFoundError("room_item_not_found")
        await self._assert_owner_of_items_room(
            item=item, owner_user_id=owner_user_id
        )
        return await self.item_writer.update_position(
            item_id=item_id, x=x, y=y
        )

    async def remove(
        self, *, owner_user_id: str, item_id: str
    ) -> None:
        item = await self.item_reader.get(item_id)
        if item is None:
            # Idempotent delete: caller can retry without us complaining.
            return
        await self._assert_owner_of_items_room(
            item=item, owner_user_id=owner_user_id
        )
        await self.item_writer.delete(item_id)

    async def _assert_owner_of_items_room(
        self, *, item: RoomItem, owner_user_id: str
    ) -> None:
        room = await self.rooms.get_by_id(item.room_id)
        if room is None:
            # Room got deleted between reads; treat as not-found so the
            # caller sees a consistent shape rather than a 403.
            raise NotFoundError("room_not_found")
        if room.owner_user_id != owner_user_id:
            raise ForbiddenError("room_item_not_owned")

    @staticmethod
    def _validate_position(x: int, y: int) -> None:
        if not (MIN_PCT <= x <= MAX_PCT) or not (MIN_PCT <= y <= MAX_PCT):
            raise BusinessError("room_item_position_out_of_range")
