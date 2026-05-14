from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.rooms.schemas import RoomResponse, UpdateRoomRequest
from app.core.deps import CurrentUserId, DbDep, IdGenDep
from app.core.exceptions import BusinessError
from app.core.ids import IIdGenerator
from app.core.sentinels import UNSET
from app.domain.models.room import Room
from app.domain.services.room_service import RoomService
from app.infrastructure.db.repositories import SqlRoomRepo, SqlUserRepo

# Two routers because the resource lives at two URL prefixes:
#   - /me/room      (owner-scoped, current-user shortcut)
#   - /rooms/{id}   (by-id, Phase 8 will widen to visitors)
# Both back the same service, kept together so wiring stays close.
me_room_router = APIRouter()
rooms_router = APIRouter()


def _service(db: AsyncSession, id_gen: IIdGenerator) -> RoomService:
    return RoomService(
        rooms=SqlRoomRepo(db),
        users=SqlUserRepo(db),
        id_gen=id_gen,
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


@rooms_router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    id_gen: IdGenDep,
) -> RoomResponse:
    """Read any room by id. Phase 4: owner-only (403 otherwise); Phase 8
    will widen this to visitors subject to ``max_visitors``."""
    if not room_id or len(room_id) > 36:
        raise BusinessError("invalid_room_id")
    svc = _service(db, id_gen)
    room = await svc.get_by_id(room_id=room_id, requester_user_id=user_id)
    return _to_response(room)
