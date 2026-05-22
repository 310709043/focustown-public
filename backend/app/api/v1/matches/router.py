from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.api.v1._common.pagination import Page, encode_cursor
from app.api.v1.matches.schemas import (
    MatchAutoMatchedResponse,
    MatchAutoResponse,
    MatchAutoWaitingResponse,
    MatchQueueStatusResponse,
    MatchResponse,
    ProposeMatchRequest,
)
from app.core.deps import (
    ClockDep,
    CurrentUserId,
    DbDep,
    EventBusDep,
    IdGenDep,
    MatchingQueueDep,
    RealtimePublisherDep,
)
from app.core.exceptions import ForbiddenError, NotFoundError
from app.domain.models import Match
from app.domain.repositories.match_repo import IMatchReader
from app.domain.repositories.user_repo import IUserReader
from app.domain.services.match_room_service import MatchRoomService
from app.domain.services.matching_queue_service import (
    MatchedResult,
    MatchingQueueService,
)
from app.domain.services.matching_service import MatchingService
from app.domain.services.strategies import SimpleOverlapStrategy
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlMatchRepo,
    SqlMatchRoomRepo,
    SqlMatchWaitingPoolRepo,
    SqlRoomParticipantRepo,
    SqlUserRepo,
)

router = APIRouter()


async def _dto(
    m: Match,
    users: IUserReader,
    *,
    cache: dict[str, str | None] | None = None,
) -> MatchResponse:
    """Hydrate both sides' ``character_key`` so the frontend can render the
    pairing illustration regardless of which side the viewer is on. One
    lookup per distinct user; callers passing a ``cache`` dict reuse hits
    across multiple matches in the same handler (used by ``/recent`` to
    avoid the N+1 pattern after batch-loading user rows).
    """
    cache = cache if cache is not None else {}

    async def _key_for(user_id: str) -> str | None:
        if user_id in cache:
            return cache[user_id]
        record = await users.get_by_id(user_id)
        key = record.character_key if record else None
        cache[user_id] = key
        return key

    requester_key = await _key_for(m.requester_id)
    candidate_key = await _key_for(m.candidate_id)
    return MatchResponse(
        id=m.id,
        requester_id=m.requester_id,
        candidate_id=m.candidate_id,
        requester_character_key=requester_key,
        candidate_character_key=candidate_key,
        compatibility=m.compatibility,
        reason=m.reason,
        status=m.status,
        created_at=m.created_at,
    )


def _match_room_service(db, ids, events, clock) -> MatchRoomService:
    return MatchRoomService(
        rooms=SqlMatchRoomRepo(db),
        participants=SqlRoomParticipantRepo(db),
        events=events,
        ids=ids,
        clock=clock,
    )


def _matching_service(db, ids, events, clock) -> MatchingService:
    return MatchingService(
        users=SqlUserRepo(db),
        matches=SqlMatchRepo(db),
        sessions=SqlFocusSessionRepo(db),
        strategy=SimpleOverlapStrategy(),
        events=events,
        ids=ids,
        clock=clock,
        session=db,
        room_svc=_match_room_service(db, ids, events, clock),
    )


def _queue_service(
    db, ids, events, clock, queue, publisher
) -> MatchingQueueService:
    return MatchingQueueService(
        queue=queue,
        pool=SqlMatchWaitingPoolRepo(db),
        matching=_matching_service(db, ids, events, clock),
        matches_reader=SqlMatchRepo(db),
        users=SqlUserRepo(db),
        publisher=publisher,
        clock=clock,
    )


@router.post("", response_model=MatchResponse, status_code=201)
async def propose_match(
    payload: ProposeMatchRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
    clock: ClockDep,
) -> MatchResponse:
    svc = _matching_service(db, ids, events, clock)
    match = await svc.propose(requester_id=user_id, candidate_id=payload.candidate_id)
    users: IUserReader = SqlUserRepo(db)
    return await _dto(match, users)


@router.post("/{match_id}/accept", response_model=MatchResponse)
async def accept_match(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
    clock: ClockDep,
) -> MatchResponse:
    svc = _matching_service(db, ids, events, clock)
    match = await svc.accept(match_id=match_id, user_id=user_id)
    users: IUserReader = SqlUserRepo(db)
    return await _dto(match, users)


@router.post("/{match_id}/skip", response_model=MatchResponse)
async def skip_match(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
    clock: ClockDep,
) -> MatchResponse:
    svc = _matching_service(db, ids, events, clock)
    match = await svc.skip(match_id=match_id, user_id=user_id)
    users: IUserReader = SqlUserRepo(db)
    return await _dto(match, users)


@router.get("/recent", response_model=Page[MatchResponse])
async def recent_matches(
    user_id: CurrentUserId,
    db: DbDep,
    cursor: str | None = Query(None, max_length=256),
    limit: int = Query(20, ge=1, le=100),
) -> Page[MatchResponse]:
    repo: IMatchReader = SqlMatchRepo(db)
    users: IUserReader = SqlUserRepo(db)
    matches = await repo.list_recent_for_user(
        user_id=user_id, cursor=cursor, limit=limit
    )
    if not matches:
        return Page[MatchResponse](items=[], next_cursor=None)
    user_ids = list(
        {m.requester_id for m in matches} | {m.candidate_id for m in matches}
    )
    fetched = await users.get_many_by_ids(user_ids)
    cache: dict[str, str | None] = {u.id: u.character_key for u in fetched}
    for uid in user_ids:
        cache.setdefault(uid, None)
    # build_page can't help here directly because each row needs an
    # awaited DTO build; do the slice + cursor derivation inline so
    # ordering matches the repo's (created_at DESC, id DESC).
    page_rows = matches[:limit]
    next_cursor = None
    if len(matches) > limit and page_rows:
        last = page_rows[-1]
        next_cursor = encode_cursor(last.created_at, last.id)
    items = [await _dto(m, users, cache=cache) for m in page_rows]
    return Page[MatchResponse](items=items, next_cursor=next_cursor)


@router.delete("/queue", status_code=204)
async def cancel_queue(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
    clock: ClockDep,
    queue: MatchingQueueDep,
    publisher: RealtimePublisherDep,
) -> Response:
    """Leave the waiting pool. Idempotent — 204 even if the caller wasn't
    waiting. Called by (a) the user pressing CANCEL in the modal and
    (b) the WebSocket disconnect hook so abandoned sessions don't keep a
    ghost waiter alive until the HASH TTL expires.

    Routes through ``MatchingQueueService.cancel`` so both the PG row
    (source of truth) and the Redis ZSET member are removed together —
    a Redis-only cancel would leave a ``waiting`` PG row that the
    reconciliation tick would re-enqueue.
    """
    svc = _queue_service(db, ids, events, clock, queue, publisher)
    await svc.cancel(user_id=user_id)
    return Response(status_code=204)


@router.get("/queue/me", response_model=MatchQueueStatusResponse)
async def get_my_queue(
    user_id: CurrentUserId,
    queue: MatchingQueueDep,
) -> MatchQueueStatusResponse:
    """Rehydration endpoint used by the frontend on page reload to know
    whether the user should drop back into the waiting modal. Returns 404
    when the user is not currently in the queue."""
    entry = await queue.is_waiting(user_id)
    if entry is None:
        raise NotFoundError("not_in_queue")
    return MatchQueueStatusResponse(
        enqueued_at_ms=entry.enqueued_at_ms,
        bot_fallback_at_ms=entry.fallback_deadline_ms,
    )


@router.get("/{match_id}", response_model=MatchResponse)
async def get_match(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
) -> MatchResponse:
    """Fetch a single match the caller participates in.

    Used by ``/focus/{id}`` to rehydrate the partner pairing header after
    a page reload (matchStore is in-memory only). Read-only — depends on
    ``IMatchReader`` per ISP. Returns 404 when unknown, 403 when the
    caller is neither requester nor candidate.
    """
    repo: IMatchReader = SqlMatchRepo(db)
    match = await repo.get(match_id)
    if match is None:
        raise NotFoundError("match_not_found")
    if user_id not in (match.requester_id, match.candidate_id):
        raise ForbiddenError("not_match_member")
    users: IUserReader = SqlUserRepo(db)
    return await _dto(match, users)


@router.post("/auto", response_model=MatchAutoResponse)
async def auto_match(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
    clock: ClockDep,
    queue: MatchingQueueDep,
    publisher: RealtimePublisherDep,
    response: Response,
) -> MatchAutoMatchedResponse | MatchAutoWaitingResponse:
    """Request matching via the waiting-pool flow.

    1. **Immediate pair**: if another real user is already waiting (and
       isn't in the requester's 14-match dedup window), pair them right
       away. HTTP 201 with the created Match — frontend transitions
       straight into "proposed" state.
    2. **Enqueue**: otherwise place the requester in the waiting pool.
       HTTP 202 with ``enqueued_at_ms`` + ``bot_fallback_at_ms`` so the
       UI can render an elapsed-seconds counter and a deterministic
       fallback ETA. A periodic worker sweep pairs incoming waiters and
       bot-falls-back anyone past their deadline.

    Idempotent: a second POST while waiting returns the same waiting
    state (not 409) so duplicate browser tabs don't double-enqueue. The
    underlying ``RedisMatchingQueue`` uses ``ZADD NX`` to enforce.
    """
    svc = _queue_service(db, ids, events, clock, queue, publisher)
    result = await svc.request(requester_id=user_id)

    if isinstance(result, MatchedResult):
        users: IUserReader = SqlUserRepo(db)
        match_dto = await _dto(result.match, users)
        response.status_code = 201
        return MatchAutoMatchedResponse(via=result.via, match=match_dto)

    response.status_code = 202
    return MatchAutoWaitingResponse(
        enqueued_at_ms=result.enqueued_at_ms,
        bot_fallback_at_ms=result.bot_fallback_at_ms,
    )
