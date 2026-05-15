from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.rooms.schemas import (
    AddRoomTrackRequest,
    MoveRoomItemRequest,
    PlaceRoomItemRequest,
    PlaybackChangeRequest,
    RoomItemResponse,
    RoomPlaybackResponse,
    RoomResponse,
    RoomTrackResponse,
    RoomVisitResponse,
    UpdateRoomRequest,
)
from app.api.v1.tracks.schemas import TrackResponse
from app.core.clock import IClock
from app.core.deps import (
    ClockDep,
    CurrentUserId,
    DbDep,
    IdGenDep,
    PresenceTrackerDep,
    RealtimePublisherDep,
)
from app.core.exceptions import BusinessError
from app.core.ids import IIdGenerator
from app.core.sentinels import UNSET
from app.domain.models.room import Room
from app.domain.models.room_item import RoomItem
from app.domain.models.room_playback import RoomPlayback
from app.domain.models.room_visit import RoomVisit
from app.domain.repositories.presence import IPresenceTracker
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.track_repo import TrackRecord
from app.domain.services.presence_service import PresenceService
from app.domain.services.room_decoration_service import RoomDecorationService
from app.domain.services.room_playback_service import RoomPlaybackService
from app.domain.services.room_service import RoomService
from app.domain.services.room_track_service import (
    RoomTrackEntry,
    RoomTrackService,
)
from app.domain.services.room_visit_service import RoomVisitService
from app.infrastructure.db.repositories import (
    SqlRoomItemRepo,
    SqlRoomPlaybackRepo,
    SqlRoomRepo,
    SqlRoomTrackRepo,
    SqlRoomVisitRepo,
    SqlTrackRepo,
    SqlUserItemRepo,
    SqlUserRepo,
)

# Two routers because the resource lives at two URL prefixes:
#   - /me/room      (owner-scoped, current-user shortcut)
#   - /rooms/{id}   (by-id; visitor-readable for public rooms after Phase 5)
# Both back the same services, kept together so wiring stays close.
me_room_router = APIRouter()
rooms_router = APIRouter()


def _service(db: AsyncSession, id_gen: IIdGenerator) -> RoomService:
    return RoomService(
        rooms=SqlRoomRepo(db),
        users=SqlUserRepo(db),
        id_gen=id_gen,
    )


def _decoration_service(
    db: AsyncSession, id_gen: IIdGenerator
) -> RoomDecorationService:
    """Wires the concrete SQL adapters to the decoration service.

    The service depends on four narrowed Protocols (Reader/Writer where
    available); ``SqlRoomItemRepo`` and ``SqlUserItemRepo`` each
    implement both sides, so we pass the same instance into both slots.
    """
    room_items = SqlRoomItemRepo(db)
    return RoomDecorationService(
        rooms=SqlRoomRepo(db),
        item_reader=room_items,
        item_writer=room_items,
        user_items_reader=SqlUserItemRepo(db),
        id_gen=id_gen,
    )


def _room_track_service(db: AsyncSession, id_gen: IIdGenerator) -> RoomTrackService:
    return RoomTrackService(
        rooms=SqlRoomRepo(db),
        room_tracks=SqlRoomTrackRepo(db),
        tracks=SqlTrackRepo(db),
        ids=id_gen,
    )


def _room_visit_service(
    db: AsyncSession,
    id_gen: IIdGenerator,
    tracker: IPresenceTracker,
    publisher: IRealtimePublisher,
) -> RoomVisitService:
    """Wires the concrete adapters to the visit service.

    ``SqlRoomVisitRepo`` implements both ``IRoomVisitReader`` and
    ``IRoomVisitWriter``; the same instance is passed to both slots so
    the service can declare its narrowed dependencies (ISP) without us
    duplicating the SQL backend.

    ``PresenceService`` is composed here so the visit service doesn't
    take ``IPresenceTracker`` directly — the presence mutation path
    stays funneled through the existing facade (single source of truth
    for state-change broadcasts).
    """
    visits = SqlRoomVisitRepo(db)
    return RoomVisitService(
        rooms=SqlRoomRepo(db),
        visit_reader=visits,
        visit_writer=visits,
        presence=PresenceService(tracker=tracker, publisher=publisher),
        realtime=publisher,
        id_gen=id_gen,
    )


def _to_visit_response(visit: RoomVisit) -> RoomVisitResponse:
    return RoomVisitResponse(
        id=visit.id,
        room_id=visit.room_id,
        visitor_user_id=visit.visitor_user_id,
        joined_at=visit.joined_at,
    )


def _room_playback_service(
    db: AsyncSession,
    id_gen: IIdGenerator,
    publisher: IRealtimePublisher,
    clock: IClock,
) -> RoomPlaybackService:
    """Wires the concrete adapters to the playback service.

    ``SqlRoomPlaybackRepo`` implements both reader and writer protocols;
    the same instance is passed to both slots so the service declares
    its narrowed dependencies (ISP) without us duplicating the SQL
    backend. ``IClock`` is injected so timeline math stays
    deterministically testable.
    """
    playback = SqlRoomPlaybackRepo(db, id_gen)
    return RoomPlaybackService(
        rooms=SqlRoomRepo(db),
        playback_reader=playback,
        playback_writer=playback,
        tracks=SqlTrackRepo(db),
        realtime=publisher,
        clock=clock,
    )


async def _to_playback_response(
    playback: RoomPlayback | None, db: AsyncSession
) -> RoomPlaybackResponse | None:
    """Denormalize the playback row with embedded track metadata.

    Returns ``None`` when there's no playback row (room has never been
    played); callers translate that to a 204 or a structured "no
    playback yet" hint. When ``current_track_id`` is set, we round-trip
    once through ``SqlTrackRepo`` so the frontend gets a single-shot
    hydration payload.
    """
    if playback is None:
        return None
    track_meta: TrackResponse | None = None
    if playback.current_track_id is not None:
        t = await SqlTrackRepo(db).get(playback.current_track_id)
        if t is not None:
            track_meta = _track_to_response(t)
    return RoomPlaybackResponse(
        id=playback.id,
        room_id=playback.room_id,
        current_track_id=playback.current_track_id,
        started_at_ms=playback.started_at_ms,
        paused_at_ms=playback.paused_at_ms,
        is_playing=playback.is_playing,
        track=track_meta,
    )


def _track_to_response(t: TrackRecord) -> TrackResponse:
    return TrackResponse(
        id=t.id,
        title=t.title,
        artist=t.artist,
        mood=t.mood,
        duration_ms=t.duration_ms,
        content_type=t.content_type,
        file_size_bytes=t.file_size_bytes,
        license=t.license,
        uploaded_by_user_id=t.uploaded_by_user_id,
        created_at=t.created_at,
    )


def _room_track_entry_to_response(entry: RoomTrackEntry) -> RoomTrackResponse:
    return RoomTrackResponse(
        id=entry.room_track.id,
        room_id=entry.room_track.room_id,
        track_id=entry.room_track.track_id,
        position=entry.room_track.position,
        track=_track_to_response(entry.track),
    )


def _to_response(room: Room) -> RoomResponse:
    return RoomResponse(
        id=room.id,
        owner_user_id=room.owner_user_id,
        name=room.name,
        theme=room.theme,  # type: ignore[arg-type]
        visibility=room.visibility,
        max_visitors=room.max_visitors,
        created_at=room.created_at,
        updated_at=room.updated_at,
    )


def _to_item_response(item: RoomItem) -> RoomItemResponse:
    return RoomItemResponse(
        id=item.id,
        room_id=item.room_id,
        user_item_id=item.user_item_id,
        x=item.x,
        y=item.y,
        z_index=item.z_index,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@me_room_router.get("", response_model=RoomResponse)
async def get_my_room(
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> RoomResponse:
    """Return the current user's room, creating it lazily on first call."""
    svc = _service(db, id_gen)
    room = await svc.get_or_create_for_user(user_id=user_id)
    return _to_response(room)


@me_room_router.put("", response_model=RoomResponse)
async def update_my_room(
    payload: UpdateRoomRequest,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> RoomResponse:
    """Update name and/or theme. Empty payload is a no-op."""
    svc = _service(db, id_gen)
    # First call also lazy-creates so PUT doesn't 404 for a brand-new user
    # who hasn't fetched their room yet.
    await svc.get_or_create_for_user(user_id=user_id)
    name_arg = payload.name if payload.name is not None else UNSET
    theme_arg = payload.theme if payload.theme is not None else UNSET
    room = await svc.update(user_id=user_id, name=name_arg, theme=theme_arg)
    return _to_response(room)


@me_room_router.post("/items", response_model=RoomItemResponse, status_code=201)
async def place_room_item(
    payload: PlaceRoomItemRequest,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> RoomItemResponse:
    """Place a decoration item inside the current user's room.

    Returns 400 ``user_item_not_owned`` if the requester doesn't actually
    own the ``user_item_id``. Phase 5 visitor read does not extend to
    placement — only the owner can mutate.
    """
    svc = _decoration_service(db, id_gen)
    item = await svc.place(
        owner_user_id=user_id,
        user_item_id=payload.user_item_id,
        x=payload.x,
        y=payload.y,
    )
    return _to_item_response(item)


@me_room_router.put("/items/{item_id}", response_model=RoomItemResponse)
async def move_room_item(
    item_id: str,
    payload: MoveRoomItemRequest,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> RoomItemResponse:
    """Move an existing item to new (x, y). Owner-only."""
    if not item_id or len(item_id) > 36:
        raise BusinessError("invalid_room_item_id")
    svc = _decoration_service(db, id_gen)
    item = await svc.move(
        owner_user_id=user_id,
        item_id=item_id,
        x=payload.x,
        y=payload.y,
    )
    return _to_item_response(item)


@me_room_router.delete("/items/{item_id}", status_code=204)
async def remove_room_item(
    item_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> None:
    """Remove an item from the current user's room. Idempotent on missing id."""
    if not item_id or len(item_id) > 36:
        raise BusinessError("invalid_room_item_id")
    svc = _decoration_service(db, id_gen)
    await svc.remove(owner_user_id=user_id, item_id=item_id)


@rooms_router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> RoomResponse:
    """Read any room by id.

    Phase 5 widened this from owner-only to "public room or owner".
    Invite-only rooms still return 403 to non-owners. Phase 8 layers
    visit/leave session lifecycle on top of this read, not in place of it.
    """
    if not room_id or len(room_id) > 36:
        raise BusinessError("invalid_room_id")
    svc = _service(db, id_gen)
    room = await svc.get_by_id(room_id=room_id, requester_user_id=user_id)
    return _to_response(room)


@rooms_router.get("/{room_id}/items", response_model=list[RoomItemResponse])
async def list_room_items(
    room_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> list[RoomItemResponse]:
    """List decoration items inside a room.

    Visitor-readable for public rooms; invite-only returns 403 unless the
    caller is the owner (same gate as ``get_room``).
    """
    if not room_id or len(room_id) > 36:
        raise BusinessError("invalid_room_id")
    svc = _decoration_service(db, id_gen)
    items = await svc.list_for_room(room_id=room_id, requester_user_id=user_id)
    return [_to_item_response(it) for it in items]


# ── Per-room playlist (Phase 7) ─────────────────────────────────────────────
# Owner-scoped: visitor reads land in Phase 8 under /rooms/{id}/tracks.


@me_room_router.get("/tracks", response_model=list[RoomTrackResponse])
async def list_my_room_tracks(
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> list[RoomTrackResponse]:
    svc = _room_track_service(db, id_gen)
    entries = await svc.list_for_user(user_id=user_id)
    return [_room_track_entry_to_response(e) for e in entries]


@me_room_router.post("/tracks", response_model=RoomTrackResponse, status_code=201)
async def add_my_room_track(
    payload: AddRoomTrackRequest,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> RoomTrackResponse:
    svc = _room_track_service(db, id_gen)
    row = await svc.add_for_user(user_id=user_id, track_id=payload.track_id)
    # Hydrate with track metadata so the client doesn't have to refetch.
    track = await SqlTrackRepo(db).get(row.track_id)
    if track is None:  # pragma: no cover — service just validated existence
        raise BusinessError("track_disappeared_after_add")
    return RoomTrackResponse(
        id=row.id,
        room_id=row.room_id,
        track_id=row.track_id,
        position=row.position,
        track=_track_to_response(track),
    )


@me_room_router.delete("/tracks/{track_id}", status_code=204)
async def remove_my_room_track(
    track_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> None:
    if not track_id or len(track_id) > 36:
        raise BusinessError("invalid_track_id")
    svc = _room_track_service(db, id_gen)
    await svc.remove_for_user(user_id=user_id, track_id=track_id)


# ── Per-room visitor sessions (Phase 8) ─────────────────────────────────────
# All three endpoints live on ``rooms_router`` (not ``me_room_router``)
# because the room_id is the path-level subject — even the visitor's "I am
# entering room X" call goes through ``/rooms/{room_id}/visit``.


@rooms_router.post(
    "/{room_id}/visit",
    response_model=RoomVisitResponse,
    status_code=201,
)
async def visit_room(
    room_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
    tracker: PresenceTrackerDep,
    publisher: RealtimePublisherDep,
) -> RoomVisitResponse:
    """Start a visitor session in a room.

    Returns 404 if the room doesn't exist, 403 for non-owners on
    ``invite_only`` rooms, 400 ``room_full`` when ``max_visitors`` is
    reached (owner bypasses the cap). Visiting a second room while
    already in one auto-leaves the first.
    """
    if not room_id or len(room_id) > 36:
        raise BusinessError("invalid_room_id")
    svc = _room_visit_service(db, id_gen, tracker, publisher)
    visit = await svc.visit(room_id=room_id, user_id=user_id)
    return _to_visit_response(visit)


@rooms_router.post("/{room_id}/leave", status_code=204)
async def leave_room(
    room_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
    tracker: PresenceTrackerDep,
    publisher: RealtimePublisherDep,
) -> None:
    """End the caller's session in this room.

    Idempotent: silently returns 204 if the caller is not currently in
    this room.
    """
    if not room_id or len(room_id) > 36:
        raise BusinessError("invalid_room_id")
    svc = _room_visit_service(db, id_gen, tracker, publisher)
    await svc.leave(room_id=room_id, user_id=user_id)


@rooms_router.get(
    "/{room_id}/visitors",
    response_model=list[RoomVisitResponse],
)
async def list_room_visitors(
    room_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
    tracker: PresenceTrackerDep,
    publisher: RealtimePublisherDep,
) -> list[RoomVisitResponse]:
    """List active visitors. Visitor-readable on public rooms; invite-only
    returns 403 unless the caller is the owner."""
    if not room_id or len(room_id) > 36:
        raise BusinessError("invalid_room_id")
    svc = _room_visit_service(db, id_gen, tracker, publisher)
    visits = await svc.list_visitors(
        room_id=room_id, requester_user_id=user_id
    )
    return [_to_visit_response(v) for v in visits]


# ── Per-room shared playback (Phase 9) ──────────────────────────────────────
# Owner mutations live under ``me_room_router`` (owner-scoped, no room_id
# in the path — derived from /me/room → owner's only room). Visitor reads
# live under ``rooms_router`` because the room_id is the path subject.


@me_room_router.post("/playback/play", response_model=RoomPlaybackResponse)
async def play_my_room(
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
    publisher: RealtimePublisherDep,
    clock: ClockDep,
) -> RoomPlaybackResponse:
    """Start or resume playback in the caller's own room.

    Requires a track to have been selected first (``BusinessError(
    "no_track_selected")`` otherwise). Idempotent: if already playing,
    returns the current state unchanged and skips the WS broadcast.
    """
    room = await _service(db, id_gen).get_or_create_for_user(user_id=user_id)
    svc = _room_playback_service(db, id_gen, publisher, clock)
    state = await svc.play(owner_user_id=user_id, room_id=room.id)
    response = await _to_playback_response(state, db)
    assert response is not None  # play() always returns a state
    return response


@me_room_router.post(
    "/playback/pause", response_model=RoomPlaybackResponse | None
)
async def pause_my_room(
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
    publisher: RealtimePublisherDep,
    clock: ClockDep,
) -> RoomPlaybackResponse | None:
    """Pause playback in the caller's own room.

    Returns ``null`` if nothing was playing (idempotent for the
    "spam-pause-on-page-close" case).
    """
    room = await _service(db, id_gen).get_or_create_for_user(user_id=user_id)
    svc = _room_playback_service(db, id_gen, publisher, clock)
    state = await svc.pause(owner_user_id=user_id, room_id=room.id)
    return await _to_playback_response(state, db)


@me_room_router.post("/playback/change", response_model=RoomPlaybackResponse)
async def change_my_room_track(
    payload: PlaybackChangeRequest,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
    publisher: RealtimePublisherDep,
    clock: ClockDep,
) -> RoomPlaybackResponse:
    """Switch the current track and auto-play it from t=0."""
    room = await _service(db, id_gen).get_or_create_for_user(user_id=user_id)
    svc = _room_playback_service(db, id_gen, publisher, clock)
    state = await svc.change_track(
        owner_user_id=user_id, room_id=room.id, track_id=payload.track_id
    )
    response = await _to_playback_response(state, db)
    assert response is not None
    return response


@rooms_router.get(
    "/{room_id}/playback", response_model=RoomPlaybackResponse | None
)
async def get_room_playback(
    room_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
    publisher: RealtimePublisherDep,
    clock: ClockDep,
) -> RoomPlaybackResponse | None:
    """Snapshot the room's playback timeline for a freshly-joining client.

    Visitor-readable on public rooms; invite_only stays owner-only.
    Returns ``null`` if the room has no playback row yet (never played).
    """
    if not room_id or len(room_id) > 36:
        raise BusinessError("invalid_room_id")
    svc = _room_playback_service(db, id_gen, publisher, clock)
    state = await svc.get_by_room(
        room_id=room_id, requester_user_id=user_id
    )
    return await _to_playback_response(state, db)
