from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import ConflictError, NotFoundError
from app.domain.models import User
from app.domain.models.room import Room
from app.domain.repositories.track_repo import TrackRecord
from app.domain.services.room_track_service import RoomTrackService
from tests.unit.fakes import (
    FakeIdGen,
    FakeRoomRepo,
    FakeRoomTrackRepo,
    FakeTrackRepo,
)

# ── Fixtures ────────────────────────────────────────────────────────────────


def _make_user(user_id: str = "u-alice") -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name=user_id,
        character_key=None,
        role_label=None,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _make_track(track_id: str, *, title: str = "T", mood: str = "lofi") -> TrackRecord:
    return TrackRecord(
        id=track_id,
        title=title,
        artist=None,
        mood=mood,
        duration_ms=120_000,
        file_key=f"tracks/{track_id}.mp3",
        content_type="audio/mpeg",
        file_size_bytes=1024,
        license=None,
        uploaded_by_user_id="u-alice",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _make_room(*, room_id: str = "room-1", owner: str = "u-alice") -> Room:
    return Room(
        id=room_id,
        owner_user_id=owner,
        name="Alice 的房間",
        theme="night",
        visibility="public",
        max_visitors=5,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _make_service(
    *,
    rooms: list[Room] | None = None,
    tracks: list[TrackRecord] | None = None,
    ids: list[str] | None = None,
) -> tuple[RoomTrackService, FakeRoomTrackRepo, FakeRoomRepo, FakeTrackRepo]:
    room_repo = FakeRoomRepo()
    seeded_rooms = [_make_room()] if rooms is None else rooms
    for r in seeded_rooms:
        room_repo.rows[r.id] = r
    track_repo = FakeTrackRepo()
    for t in tracks or []:
        track_repo.tracks[t.id] = t
    room_track_repo = FakeRoomTrackRepo()
    svc = RoomTrackService(
        rooms=room_repo,
        room_tracks=room_track_repo,
        tracks=track_repo,
        ids=FakeIdGen(seq=iter(ids or [f"rt-{i}" for i in range(1, 100)])),
    )
    return svc, room_track_repo, room_repo, track_repo


# ── Tests ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_appends_to_end_empty_playlist() -> None:
    svc, room_tracks, _, _ = _make_service(tracks=[_make_track("t1")])
    row = await svc.add_for_user(user_id="u-alice", track_id="t1")
    assert row.position == 0
    assert len(room_tracks.rows) == 1


@pytest.mark.asyncio
async def test_add_second_appends_after_first() -> None:
    svc, _, _, _ = _make_service(
        tracks=[_make_track("t1"), _make_track("t2")]
    )
    first = await svc.add_for_user(user_id="u-alice", track_id="t1")
    second = await svc.add_for_user(user_id="u-alice", track_id="t2")
    assert first.position == 0
    assert second.position == 1


@pytest.mark.asyncio
async def test_add_unknown_track_raises_not_found() -> None:
    svc, _, _, _ = _make_service(tracks=[])
    with pytest.raises(NotFoundError, match="track_not_found"):
        await svc.add_for_user(user_id="u-alice", track_id="ghost")


@pytest.mark.asyncio
async def test_add_duplicate_raises_conflict() -> None:
    svc, _, _, _ = _make_service(tracks=[_make_track("t1")])
    await svc.add_for_user(user_id="u-alice", track_id="t1")
    with pytest.raises(ConflictError, match="already_in_playlist"):
        await svc.add_for_user(user_id="u-alice", track_id="t1")


@pytest.mark.asyncio
async def test_remove_happy_path() -> None:
    svc, room_tracks, _, _ = _make_service(tracks=[_make_track("t1")])
    await svc.add_for_user(user_id="u-alice", track_id="t1")
    await svc.remove_for_user(user_id="u-alice", track_id="t1")
    assert room_tracks.rows == []


@pytest.mark.asyncio
async def test_remove_missing_entry_raises_not_found() -> None:
    svc, _, _, _ = _make_service(tracks=[_make_track("t1")])
    with pytest.raises(NotFoundError, match="playlist_entry_not_found"):
        await svc.remove_for_user(user_id="u-alice", track_id="t1")


@pytest.mark.asyncio
async def test_list_returns_ordered_with_track_metadata() -> None:
    svc, _, _, _ = _make_service(
        tracks=[
            _make_track("t1", title="First"),
            _make_track("t2", title="Second"),
        ]
    )
    await svc.add_for_user(user_id="u-alice", track_id="t1")
    await svc.add_for_user(user_id="u-alice", track_id="t2")
    entries = await svc.list_for_user(user_id="u-alice")
    assert [e.room_track.position for e in entries] == [0, 1]
    assert [e.track.title for e in entries] == ["First", "Second"]


@pytest.mark.asyncio
async def test_add_for_user_without_room_raises_not_found() -> None:
    svc, _, _, _ = _make_service(rooms=[])
    with pytest.raises(NotFoundError, match="user_has_no_room"):
        await svc.add_for_user(user_id="u-alice", track_id="t1")
