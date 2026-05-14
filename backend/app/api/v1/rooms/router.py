from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.rooms.schemas import (
    AddRoomTrackRequest,
    MoveRoomItemRequest,
    PlaceRoomItemRequest,
    RoomItemResponse,
    RoomResponse,
    RoomTrackResponse,
    UpdateRoomRequest,
)
from app.api.v1.tracks.schemas import TrackResponse
from app.core.deps import CurrentUserId, DbDep, IdGenDep
from app.core.exceptions import BusinessError
from app.core.ids import IIdGenerator
from app.core.sentinels import UNSET
from app.domain.models.room import Room
from app.domain.models.room_item import RoomItem
from app.domain.repositories.track_repo import TrackRecord
from app.domain.services.room_decoration_service import RoomDecorationService
from app.domain.services.room_service import RoomService
from app.domain.services.room_track_service import (
    RoomTrackEntry,
    RoomTrackService,
)
from app.infrastructure.db.repositories import (
    SqlRoomItemRepo,
    SqlRoomRepo,
    SqlRoomTrackRepo,
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
