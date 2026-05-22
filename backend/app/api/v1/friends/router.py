from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi import status as http_status

from app.api.v1._common.pagination import Page, build_page
from app.api.v1.friends.schemas import (
    FocusingNowItem,
    FocusingNowResponse,
    FriendRequestRequest,
    FriendSummaryDTO,
)
from app.core.deps import (
    ClockDep,
    CurrentUserId,
    DbDep,
    IdGenDep,
    RealtimePublisherDep,
)
from app.domain.services.friendship_service import (
    STATUS_ACCEPTED,
    STATUS_REQUESTED,
    FriendshipService,
)
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlFriendshipRepo,
    SqlUserRepo,
)

router = APIRouter()


def _service(  # type: ignore[no-untyped-def]
    db, publisher, ids, clock
) -> FriendshipService:
    return FriendshipService(
        friendships=SqlFriendshipRepo(db),
        users=SqlUserRepo(db),
        focus_sessions=SqlFocusSessionRepo(db),
        publisher=publisher,
        ids=ids,
        clock=clock,
    )


@router.get("", response_model=Page[FriendSummaryDTO])
async def list_my_friends(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
    status: str = Query(STATUS_ACCEPTED, max_length=16),
    cursor: str | None = Query(None, max_length=256),
    limit: int = Query(50, ge=1, le=100),
) -> Page[FriendSummaryDTO]:
    svc = _service(db, publisher, ids, clock)
    rows = await svc.list_friends(
        user_id=user_id, status=status, cursor=cursor, limit=limit
    )
    return build_page(
        rows,
        limit=limit,
        key=lambda r: (r.created_at, r.friendship_id),
        to_item=lambda r: FriendSummaryDTO(**r.__dict__),
    )


@router.get("/focusing-now", response_model=FocusingNowResponse)
async def list_friends_focusing_now(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> FocusingNowResponse:
    svc = _service(db, publisher, ids, clock)
    rows = await svc.list_focusing_now(user_id=user_id)
    return FocusingNowResponse(
        friends_focusing=[FocusingNowItem(**r.__dict__) for r in rows]
    )


@router.post(
    "/requests",
    response_model=FriendSummaryDTO,
    status_code=http_status.HTTP_201_CREATED,
)
async def request_friendship(
    payload: FriendRequestRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> FriendSummaryDTO:
    svc = _service(db, publisher, ids, clock)
    await svc.request(requester_id=user_id, target_id=payload.user_id)
    # Return the now-fresh friendship as seen from the requester side.
    refreshed = await svc.list_friends(
        user_id=user_id, status=STATUS_REQUESTED
    )
    # Most-recent first per repo ordering — find the matching pair.
    for f in refreshed + await svc.list_friends(
        user_id=user_id, status=STATUS_ACCEPTED
    ):
        if f.user_id == payload.user_id:
            return FriendSummaryDTO(**f.__dict__)
    # Shouldn't happen: request() either returned or raised.
    return FriendSummaryDTO(  # pragma: no cover
        friendship_id="",
        user_id=payload.user_id,
        display_name="",
        character_key=None,
        status=STATUS_REQUESTED,
        requested_by_me=True,
        created_at=clock.now(),
        accepted_at=None,
    )


@router.post(
    "/requests/{friendship_id}/accept",
    response_model=FriendSummaryDTO,
)
async def accept_friendship(
    friendship_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> FriendSummaryDTO:
    svc = _service(db, publisher, ids, clock)
    await svc.accept(friendship_id=friendship_id, accepter_id=user_id)
    fresh = await svc.list_friends(user_id=user_id, status=STATUS_ACCEPTED)
    for f in fresh:
        if f.friendship_id == friendship_id:
            return FriendSummaryDTO(**f.__dict__)
    return FriendSummaryDTO(  # pragma: no cover
        friendship_id=friendship_id,
        user_id="",
        display_name="",
        character_key=None,
        status=STATUS_ACCEPTED,
        requested_by_me=False,
        created_at=clock.now(),
        accepted_at=clock.now(),
    )


@router.delete(
    "/requests/{friendship_id}", status_code=http_status.HTTP_204_NO_CONTENT
)
async def reject_friendship(
    friendship_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> None:
    svc = _service(db, publisher, ids, clock)
    await svc.reject(friendship_id=friendship_id, rejecter_id=user_id)


@router.delete(
    "/{friendship_id}", status_code=http_status.HTTP_204_NO_CONTENT
)
async def unfriend(
    friendship_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> None:
    svc = _service(db, publisher, ids, clock)
    await svc.unfriend(friendship_id=friendship_id, actor_id=user_id)
