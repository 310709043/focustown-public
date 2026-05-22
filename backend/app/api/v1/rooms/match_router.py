from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.rooms.match_schemas import (
    MatchRoomResponse,
    RoomParticipantResponse,
    StartMatchRoomRequest,
)
from app.core.deps import CurrentUserId, MatchRoomServiceDep
from app.domain.services.match_room_service import RoomSnapshot

# Mounted at /rooms/match in api/v1/__init__.py. Kept in its own router
# (separate from rooms/router.py's owner-room endpoints) because the
# resource is conceptually different — owner-rooms are a user's
# permanent decor room; match-rooms are transient two-participant
# shared focus rooms scoped to one accepted match.
router = APIRouter()


def _to_response(snapshot: RoomSnapshot) -> MatchRoomResponse:
    return MatchRoomResponse(
        id=snapshot.room.id,
        match_id=snapshot.room.match_id,
        status=snapshot.room.status,
        opened_at=snapshot.room.opened_at,
        activated_at=snapshot.room.activated_at,
        ended_at=snapshot.room.ended_at,
        ended_reason=snapshot.room.ended_reason,
        participants=[
            RoomParticipantResponse(
                user_id=p.user_id,
                role=p.role,
                joined_at=p.joined_at,
                left_at=p.left_at,
                focus_session_id=p.focus_session_id,
            )
            for p in snapshot.participants
        ],
        timer_started_at=snapshot.timer_started_at,
        timer_duration_seconds=snapshot.timer_duration_seconds,
        timer_remaining_seconds=snapshot.timer_remaining_seconds,
        timer_expected_end_at=snapshot.timer_expected_end_at,
    )


@router.get("/{match_id}", response_model=MatchRoomResponse)
async def get_match_room(
    match_id: str,
    user_id: CurrentUserId,
    svc: MatchRoomServiceDep,
) -> MatchRoomResponse:
    """Fetch the shared focus room for ``match_id``.

    The path key is the match id (the value the frontend already has
    after accept), not the internal room id — it's the natural lookup
    key and avoids exposing two ids for the same resource.

    Non-participants get 404 ``match_room_not_found`` (not 403) to
    avoid leaking whether the room exists. The membership check is
    inside the service.
    """
    snapshot = await svc.get_snapshot(
        match_id=match_id, requesting_user_id=user_id
    )
    return _to_response(snapshot)


@router.post("/{match_id}/join", response_model=MatchRoomResponse)
async def join_match_room(
    match_id: str,
    user_id: CurrentUserId,
    svc: MatchRoomServiceDep,
) -> MatchRoomResponse:
    """Mark the caller as joined.

    Idempotent at the data layer — a repeat call from the same user
    keeps ``joined_at`` set to the latest call. The ``open →
    both_joined`` transition + ``RoomReady`` event only fire on the
    transition itself, so consumers won't double-fan-out.
    """
    snapshot = await svc.join(match_id=match_id, user_id=user_id)
    return _to_response(snapshot)


@router.post("/{match_id}/leave", response_model=MatchRoomResponse)
async def leave_match_room(
    match_id: str,
    user_id: CurrentUserId,
    svc: MatchRoomServiceDep,
) -> MatchRoomResponse:
    """Mark the caller as left.

    When both participants have left, the room transitions to
    ``ended`` with ``ended_reason='both_left'``. Idempotent — repeat
    calls are a no-op once the row is ``ended``.
    """
    snapshot = await svc.leave(match_id=match_id, user_id=user_id)
    return _to_response(snapshot)


@router.post("/{match_id}/start", response_model=MatchRoomResponse)
async def start_match_room_session(
    match_id: str,
    payload: StartMatchRoomRequest,
    user_id: CurrentUserId,
    svc: MatchRoomServiceDep,
) -> MatchRoomResponse:
    """Phase 08 — arm the shared focus timer.

    Pre-condition: the room is in ``both_joined``. Calling on an
    already-``active`` room is idempotent (returns the current
    snapshot); any other status is a 409 ``room_not_ready``.

    Once accepted, the server publishes ``room.session_started`` to
    both clients and the worker begins emitting ``room.timer_tick``
    every ~1s until the duration elapses.
    """
    snapshot = await svc.start_session(
        match_id=match_id,
        user_id=user_id,
        duration_seconds=payload.duration_seconds,
    )
    return _to_response(snapshot)
