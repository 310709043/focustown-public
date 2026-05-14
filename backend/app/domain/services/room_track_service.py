from __future__ import annotations

from dataclasses import dataclass

from app.core.exceptions import (
    ConflictError,
    IdempotencyViolationError,
    NotFoundError,
)
from app.core.ids import IIdGenerator
from app.domain.repositories.room_repo import IRoomRepo
from app.domain.repositories.room_track_repo import (
    IRoomTrackRepo,
    RoomTrackRecord,
)
from app.domain.repositories.track_repo import ITrackRepo, TrackRecord


@dataclass(slots=True, frozen=True)
class RoomTrackEntry:
    """View record returned by the service — joins ``RoomTrackRecord``
    with the track metadata so the API layer can serialize in one pass.
    """

    room_track: RoomTrackRecord
    track: TrackRecord


class RoomTrackService:
    """Per-room playlist management for the room owner.

    The constructor takes the composed ``IRoomTrackRepo`` because the
    service does both reads (``max_position``) and writes (``add`` /
    ``remove``). It takes ``IRoomRepo`` and ``ITrackRepo`` as-is even
    though it only calls reader-side methods (``rooms.get_by_owner`` and
    ``tracks.get``) — narrowing those Protocols belongs in a separate
    refactor stint, not here.

    Service-on-service coupling is avoided: this service does NOT depend
    on ``RoomService``. If the user has not yet created their room
    (``/me/room`` GET is get-or-create — the frontend always calls it on
    app load), ``add_for_user`` raises a defensive ``NotFoundError``.
    """

    def __init__(
        self,
        *,
        rooms: IRoomRepo,
        room_tracks: IRoomTrackRepo,
        tracks: ITrackRepo,
        ids: IIdGenerator,
    ) -> None:
        self._rooms = rooms
        self._room_tracks = room_tracks
        self._tracks = tracks
        self._ids = ids

    async def list_for_user(self, *, user_id: str) -> list[RoomTrackEntry]:
        room = await self._rooms.get_by_owner(user_id)
        if room is None:
            raise NotFoundError("user_has_no_room")
        rows = await self._room_tracks.list_by_room(room.id)
        entries: list[RoomTrackEntry] = []
        for r in rows:
            track = await self._tracks.get(r.track_id)
            if track is None:
                # Track was hard-deleted but FK CASCADE should have
                # removed this row — defensive skip.
                continue
            entries.append(RoomTrackEntry(room_track=r, track=track))
        return entries

    async def add_for_user(
        self, *, user_id: str, track_id: str
    ) -> RoomTrackRecord:
        room = await self._rooms.get_by_owner(user_id)
        if room is None:
            raise NotFoundError("user_has_no_room")
        track = await self._tracks.get(track_id)
        if track is None:
            raise NotFoundError("track_not_found")
        next_pos = await self._room_tracks.max_position(room.id)
        position = 0 if next_pos is None else next_pos + 1
        try:
            return await self._room_tracks.add(
                item_id=self._ids.new_id(),
                room_id=room.id,
                track_id=track_id,
                position=position,
            )
        except IdempotencyViolationError as e:
            raise ConflictError("already_in_playlist") from e

    async def remove_for_user(self, *, user_id: str, track_id: str) -> None:
        room = await self._rooms.get_by_owner(user_id)
        if room is None:
            raise NotFoundError("user_has_no_room")
        removed = await self._room_tracks.remove(
            room_id=room.id, track_id=track_id
        )
        if not removed:
            raise NotFoundError("playlist_entry_not_found")
