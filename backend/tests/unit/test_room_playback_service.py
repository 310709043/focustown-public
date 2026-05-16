from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import (
    BusinessError,
    ForbiddenError,
    NotFoundError,
)
from app.domain.models.room import Room
from app.domain.repositories.track_repo import ITrackRepo, TrackRecord
from app.domain.services.room_playback_service import RoomPlaybackService
from tests.unit.fakes import (
    FakeClock,
    FakeRoomPlaybackRepo,
    FakeRoomRepo,
    RecordingPublisher,
)

# ── Lightweight track-repo fake (only get() is exercised here) ──────────────


@dataclass
class FakeTrackRepoForPlayback(ITrackRepo):
    rows: dict[str, TrackRecord]

    async def list(self, *, mood: str | None = None) -> list[TrackRecord]:
        return list(self.rows.values())

    async def list_official(self) -> list[TrackRecord]:
        return sorted(
            (t for t in self.rows.values() if t.is_official),
            key=lambda t: t.id,
        )

    async def get(self, track_id: str) -> TrackRecord | None:
        return self.rows.get(track_id)

    async def get_many_by_ids(self, track_ids: list[str]) -> list[TrackRecord]:
        return [self.rows[tid] for tid in track_ids if tid in self.rows]

    async def insert(self, **_: object) -> TrackRecord:  # type: ignore[override]
        raise NotImplementedError


# ── Fixtures ────────────────────────────────────────────────────────────────


T0 = datetime(2026, 5, 16, 12, 0, 0, tzinfo=UTC)
T0_MS = int(T0.timestamp() * 1000)


def _make_track(track_id: str = "t-lofi") -> TrackRecord:
    return TrackRecord(
        id=track_id,
        title="Lo-fi Loop",
        artist="Anon",
        mood="lofi",
        duration_ms=180_000,
        file_key=f"tracks/{track_id}.mp3",
        content_type="audio/mpeg",
        file_size_bytes=2_000_000,
        license="CC0",
        uploaded_by_user_id="u-alice",
        created_at=T0,
        updated_at=T0,
    )


def _seed_room(
    rooms: FakeRoomRepo,
    *,
    room_id: str = "room-alice",
    owner_user_id: str = "u-alice",
    visibility: str = "public",
) -> Room:
    room = Room(
        id=room_id,
        owner_user_id=owner_user_id,
        name="Alice 的房間",
        theme="night",
        visibility=visibility,  # type: ignore[arg-type]
        max_visitors=5,
        created_at=T0,
        updated_at=T0,
    )
    rooms.rows[room_id] = room
    return room


def _make_service(
    *,
    tracks: dict[str, TrackRecord] | None = None,
    clock_at: datetime = T0,
) -> tuple[
    RoomPlaybackService,
    FakeRoomRepo,
    FakeRoomPlaybackRepo,
    FakeClock,
    RecordingPublisher,
]:
    rooms = FakeRoomRepo()
    playback = FakeRoomPlaybackRepo()
    track_repo = FakeTrackRepoForPlayback(rows=tracks or {_make_track().id: _make_track()})
    clock = FakeClock(current=clock_at)
    publisher = RecordingPublisher()
    svc = RoomPlaybackService(
        rooms=rooms,
        playback_reader=playback,
        playback_writer=playback,
        tracks=track_repo,
        realtime=publisher,
        clock=clock,
    )
    return svc, rooms, playback, clock, publisher


# ── change_track ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_change_track_sets_started_at_to_now_ms() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    state = await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    assert state.started_at_ms == T0_MS


@pytest.mark.asyncio
async def test_change_track_starts_playing_automatically() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    state = await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    assert state.is_playing is True


@pytest.mark.asyncio
async def test_change_track_publishes_music_change_event() -> None:
    svc, rooms, _, _, publisher = _make_service()
    _seed_room(rooms)
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    music_change = [
        p for (_, p) in publisher.published if p.get("type") == "music.change"
    ]
    assert len(music_change) == 1


@pytest.mark.asyncio
async def test_change_track_rejects_unknown_track() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    with pytest.raises(NotFoundError) as exc:
        await svc.change_track(
            owner_user_id="u-alice", room_id="room-alice", track_id="t-ghost"
        )
    assert "track_not_found" in str(exc.value)


@pytest.mark.asyncio
async def test_change_track_rejects_non_owner() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    with pytest.raises(ForbiddenError) as exc:
        await svc.change_track(
            owner_user_id="u-bob", room_id="room-alice", track_id="t-lofi"
        )
    assert "room_not_owned" in str(exc.value)


# ── play ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_play_rejects_when_no_track_selected() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    with pytest.raises(BusinessError) as exc:
        await svc.play(owner_user_id="u-alice", room_id="room-alice")
    assert "no_track_selected" in str(exc.value)


@pytest.mark.asyncio
async def test_play_is_noop_when_already_playing() -> None:
    svc, rooms, _, _, publisher = _make_service()
    _seed_room(rooms)
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    publisher.published.clear()
    # Already playing after change_track — second play should not publish.
    await svc.play(owner_user_id="u-alice", room_id="room-alice")
    play_events = [
        p for (_, p) in publisher.published if p.get("type") == "music.play"
    ]
    assert play_events == []


@pytest.mark.asyncio
async def test_play_after_pause_shifts_started_at_by_pause_duration() -> None:
    svc, rooms, _, clock, _ = _make_service()
    _seed_room(rooms)
    # t=0: change_track → started_at_ms = T0_MS
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    # t=10s: pause → paused_at_ms = T0_MS + 10_000
    clock.advance(timedelta(seconds=10))
    await svc.pause(owner_user_id="u-alice", room_id="room-alice")
    # t=15s (5s of pause): play → started_at_ms shifts forward by 5_000
    clock.advance(timedelta(seconds=5))
    resumed = await svc.play(owner_user_id="u-alice", room_id="room-alice")
    assert resumed.started_at_ms == T0_MS + 5_000


@pytest.mark.asyncio
async def test_play_after_pause_clears_paused_at_ms() -> None:
    svc, rooms, _, clock, _ = _make_service()
    _seed_room(rooms)
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    clock.advance(timedelta(seconds=10))
    await svc.pause(owner_user_id="u-alice", room_id="room-alice")
    clock.advance(timedelta(seconds=5))
    resumed = await svc.play(owner_user_id="u-alice", room_id="room-alice")
    assert resumed.paused_at_ms is None


@pytest.mark.asyncio
async def test_play_rejects_non_owner() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    with pytest.raises(ForbiddenError):
        await svc.play(owner_user_id="u-bob", room_id="room-alice")


# ── pause ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pause_sets_paused_at_to_now_ms() -> None:
    svc, rooms, _, clock, _ = _make_service()
    _seed_room(rooms)
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    clock.advance(timedelta(seconds=8))
    paused = await svc.pause(owner_user_id="u-alice", room_id="room-alice")
    assert paused is not None and paused.paused_at_ms == T0_MS + 8_000


@pytest.mark.asyncio
async def test_pause_flips_is_playing_false() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    paused = await svc.pause(owner_user_id="u-alice", room_id="room-alice")
    assert paused is not None and paused.is_playing is False


@pytest.mark.asyncio
async def test_pause_when_no_track_returns_none() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    result = await svc.pause(owner_user_id="u-alice", room_id="room-alice")
    assert result is None


@pytest.mark.asyncio
async def test_pause_when_already_paused_is_idempotent() -> None:
    svc, rooms, _, clock, publisher = _make_service()
    _seed_room(rooms)
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    clock.advance(timedelta(seconds=10))
    await svc.pause(owner_user_id="u-alice", room_id="room-alice")
    publisher.published.clear()
    # Second pause should not re-publish or re-write the timestamp.
    again = await svc.pause(owner_user_id="u-alice", room_id="room-alice")
    pause_events = [
        p for (_, p) in publisher.published if p.get("type") == "music.pause"
    ]
    assert again is not None and pause_events == []


@pytest.mark.asyncio
async def test_pause_rejects_non_owner() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    with pytest.raises(ForbiddenError):
        await svc.pause(owner_user_id="u-bob", room_id="room-alice")


# ── get_by_room (visitor read) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_by_room_returns_none_when_never_played() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms)
    state = await svc.get_by_room(
        room_id="room-alice", requester_user_id="u-bob"
    )
    assert state is None


@pytest.mark.asyncio
async def test_get_by_room_returns_state_for_public_room() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms, visibility="public")
    await svc.change_track(
        owner_user_id="u-alice", room_id="room-alice", track_id="t-lofi"
    )
    visitor_state = await svc.get_by_room(
        room_id="room-alice", requester_user_id="u-bob"
    )
    assert visitor_state is not None and visitor_state.current_track_id == "t-lofi"


@pytest.mark.asyncio
async def test_get_by_room_rejects_invite_only_for_non_owner() -> None:
    svc, rooms, _, _, _ = _make_service()
    _seed_room(rooms, visibility="invite_only")
    with pytest.raises(ForbiddenError) as exc:
        await svc.get_by_room(
            room_id="room-alice", requester_user_id="u-bob"
        )
    assert "room_not_accessible" in str(exc.value)


@pytest.mark.asyncio
async def test_get_by_room_unknown_room_raises_not_found() -> None:
    svc, _, _, _, _ = _make_service()
    with pytest.raises(NotFoundError) as exc:
        await svc.get_by_room(
            room_id="room-ghost", requester_user_id="u-alice"
        )
    assert "room_not_found" in str(exc.value)
