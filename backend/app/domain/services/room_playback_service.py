from __future__ import annotations

from dataclasses import dataclass

from app.core.clock import IClock
from app.core.exceptions import (
    BusinessError,
    ForbiddenError,
    NotFoundError,
)
from app.domain.models.room_playback import RoomPlayback
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.room_playback_repo import (
    IRoomPlaybackReader,
    IRoomPlaybackWriter,
)
from app.domain.repositories.room_repo import IRoomRepo
from app.domain.repositories.track_repo import ITrackRepo


@dataclass(slots=True)
class RoomPlaybackService:
    """Per-room shared playback timeline (Phase 9).

    SOLID:
    - S: only handles the playback timeline. RoomTrackService keeps owning
      the catalog of available tracks per room; this service owns which
      one is playing *right now* and where the playhead is.
    - D: depends on Protocols (IRoomRepo, IRoomPlaybackReader/Writer,
      ITrackRepo, IRealtimePublisher, IClock, IIdGenerator). Zero
      SQLAlchemy or FastAPI imports.
    - I: playback-repo deps narrowed to Reader / Writer facets. ITrackRepo
      isn't yet Reader/Writer-split in this codebase — the service only
      calls reader-side ``.get()``; a follow-up ISP refactor can narrow
      this without changing the service contract.

    Permission model:
    - All mutations (play / pause / change_track) require the caller to
      be the room's owner. Visitor reads via ``get_by_room`` are gated
      by room visibility (public OR owner; invite_only stays owner-only).

    Timeline math (epoch milliseconds, source of truth for drift):
    - ``play()``: resume from where paused if currently paused, else
      idempotent. Re-anchors started_at_ms forward by the pause duration.
    - ``pause()``: snapshot paused_at_ms = now. The frontend's drift loop
      then treats elapsed as ``paused_at_ms - started_at_ms``.
    - ``change_track()``: new track, started_at_ms = now, auto-play.

    The IClock dependency is what makes this service deterministically
    testable — the unit tests inject a FakeClock and assert exact
    millisecond values on the resulting RoomPlayback rows.
    """

    rooms: IRoomRepo
    playback_reader: IRoomPlaybackReader
    playback_writer: IRoomPlaybackWriter
    tracks: ITrackRepo
    realtime: IRealtimePublisher
    clock: IClock

    def _now_ms(self) -> int:
        # IClock returns a tz-aware datetime; epoch ms is the wire format
        # the frontend's Date.now() uses, so we centralise the conversion
        # here rather than scattering ``.timestamp() * 1000`` everywhere.
        return int(self.clock.now().timestamp() * 1000)

    async def get_by_room(
        self, *, room_id: str, requester_user_id: str
    ) -> RoomPlayback | None:
        room = await self.rooms.get_by_id(room_id)
        if room is None:
            raise NotFoundError("room_not_found")
        if (
            room.owner_user_id != requester_user_id
            and room.visibility == "invite_only"
        ):
            raise ForbiddenError("room_not_accessible")
        return await self.playback_reader.get_by_room(room_id)

    async def play(
        self, *, owner_user_id: str, room_id: str
    ) -> RoomPlayback:
        await self._assert_owner(room_id=room_id, owner_user_id=owner_user_id)
        current = await self.playback_reader.get_by_room(room_id)
        if current is None or current.current_track_id is None:
            raise BusinessError("no_track_selected")
        if current.is_playing:
            return current

        now_ms = self._now_ms()
        # Resume from where paused: shift started_at_ms forward by the
        # pause duration so the elapsed timeline stays continuous.
        if current.paused_at_ms is not None and current.started_at_ms is not None:
            pause_duration = now_ms - current.paused_at_ms
            new_started_at_ms = current.started_at_ms + pause_duration
        else:
            new_started_at_ms = now_ms

        next_state = await self.playback_writer.upsert(
            room_id=room_id,
            current_track_id=current.current_track_id,
            started_at_ms=new_started_at_ms,
            paused_at_ms=None,
            is_playing=True,
        )
        await self.realtime.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "music.play",
                "room_id": room_id,
                "track_id": next_state.current_track_id,
                "started_at_ms": next_state.started_at_ms,
            },
        )
        return next_state

    async def pause(
        self, *, owner_user_id: str, room_id: str
    ) -> RoomPlayback | None:
        await self._assert_owner(room_id=room_id, owner_user_id=owner_user_id)
        current = await self.playback_reader.get_by_room(room_id)
        if current is None or current.current_track_id is None:
            # Nothing to pause — return None so the router can 204.
            return None
        if not current.is_playing:
            return current

        now_ms = self._now_ms()
        next_state = await self.playback_writer.upsert(
            room_id=room_id,
            current_track_id=current.current_track_id,
            started_at_ms=current.started_at_ms,
            paused_at_ms=now_ms,
            is_playing=False,
        )
        await self.realtime.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "music.pause",
                "room_id": room_id,
                "paused_at_ms": now_ms,
            },
        )
        return next_state

    async def change_track(
        self, *, owner_user_id: str, room_id: str, track_id: str
    ) -> RoomPlayback:
        await self._assert_owner(room_id=room_id, owner_user_id=owner_user_id)
        track = await self.tracks.get(track_id)
        if track is None:
            raise NotFoundError("track_not_found")

        now_ms = self._now_ms()
        next_state = await self.playback_writer.upsert(
            room_id=room_id,
            current_track_id=track_id,
            started_at_ms=now_ms,
            paused_at_ms=None,
            is_playing=True,
        )
        await self.realtime.publish(
            IRealtimePublisher.room_channel(room_id),
            {
                "type": "music.change",
                "room_id": room_id,
                "track_id": track_id,
                "started_at_ms": now_ms,
            },
        )
        return next_state

    async def _assert_owner(
        self, *, room_id: str, owner_user_id: str
    ) -> None:
        room = await self.rooms.get_by_id(room_id)
        if room is None:
            raise NotFoundError("room_not_found")
        if room.owner_user_id != owner_user_id:
            raise ForbiddenError("room_not_owned")
