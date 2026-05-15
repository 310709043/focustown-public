from __future__ import annotations

from dataclasses import dataclass

from app.core.exceptions import BusinessError, ForbiddenError, NotFoundError
from app.core.ids import IIdGenerator
from app.core.sentinels import UNSET, UnsetType
from app.domain.models.room import (
    ALLOWED_THEMES,
    DEFAULT_THEME,
    MAX_ROOM_NAME_LEN,
    Room,
)
from app.domain.repositories.room_repo import IRoomRepo, RoomAlreadyExistsError
from app.domain.repositories.user_repo import IUserRepo


@dataclass(slots=True)
class RoomService:
    """Owns the room lifecycle: lazy-create, owner updates, owner-only reads.

    SOLID:
    - S: only handles rooms; doesn't touch presence, wallet, or items.
      Item placement lives in ``RoomDecorationService``.
    - D: depends on ``IRoomRepo`` + ``IUserRepo`` Protocols; no SQLAlchemy.
    - O: Phase 5 widened ``get_by_id`` to allow visitor reads on public
      rooms. The access decision lives here, not in the repo, so adding
      a new visibility (e.g. ``"followers_only"``) only edits this gate.
      Phase 8 will layer visit/leave session lifecycle on top — separate
      from visibility, which is what this gate enforces.
    """

    rooms: IRoomRepo
    users: IUserRepo
    id_gen: IIdGenerator

    async def get_or_create_for_user(self, *, user_id: str) -> Room:
        existing = await self.rooms.get_by_owner(user_id)
        if existing is not None:
            return existing
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise NotFoundError("user_not_found")
        default_name = f"{user.display_name} 的房間"
        try:
            return await self.rooms.create(
                room_id=self.id_gen.new_id(),
                owner_user_id=user_id,
                name=default_name,
                theme=DEFAULT_THEME,
            )
        except RoomAlreadyExistsError:
            # Concurrent lazy-create lost the race: the UNIQUE index let
            # the other request win. Re-read instead of bubbling the
            # error to the caller (idempotency lives at the DB layer).
            again = await self.rooms.get_by_owner(user_id)
            if again is None:
                raise
            return again

    async def update(
        self,
        *,
        user_id: str,
        name: str | UnsetType = UNSET,
        theme: str | UnsetType = UNSET,
    ) -> Room:
        room = await self.rooms.get_by_owner(user_id)
        if room is None:
            raise NotFoundError("room_not_found")
        normalized_name: str | UnsetType = UNSET
        if isinstance(name, str):
            trimmed = name.strip()
            if not (1 <= len(trimmed) <= MAX_ROOM_NAME_LEN):
                raise BusinessError("invalid_room_name")
            normalized_name = trimmed
        if isinstance(theme, str) and theme not in ALLOWED_THEMES:
            raise BusinessError("invalid_room_theme")
        return await self.rooms.update(
            room_id=room.id,
            name=normalized_name,
            theme=theme,
        )

    async def get_by_id(self, *, room_id: str, requester_user_id: str) -> Room:
        room = await self.rooms.get_by_id(room_id)
        if room is None:
            raise NotFoundError("room_not_found")
        # Phase 5: visitors can read public rooms; invite_only stays
        # owner-only. Phase 8's visit/leave is layered on top of this
        # (presence transitions inside an admitted read), not a substitute.
        if (
            room.owner_user_id != requester_user_id
            and room.visibility == "invite_only"
        ):
            raise ForbiddenError("room_not_accessible")
        return room
