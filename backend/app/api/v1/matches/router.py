from __future__ import annotations

import random

from fastapi import APIRouter

from app.api.v1.matches.schemas import MatchResponse, ProposeMatchRequest
from app.core.deps import (
    ClockDep,
    CurrentUserId,
    DbDep,
    EventBusDep,
    IdGenDep,
    PresenceTrackerDep,
)
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.domain.models import Match
from app.domain.repositories.match_repo import IMatchReader
from app.domain.repositories.user_repo import IUserReader
from app.domain.services.matching_service import MatchingService
from app.domain.services.strategies import SimpleOverlapStrategy
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlMatchRepo,
    SqlUserRepo,
)

router = APIRouter()

# When picking auto-match candidates, de-dup against this many of the
# requester's most recent matches (any status). Keeps the user from
# seeing the same candidate twice in a short stretch, including after
# they skip — Plan agent point: "user spamming Skip exhausts the pool".
_RECENT_DEDUP_WINDOW = 14


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


def _service(db, ids, events, clock) -> MatchingService:
    return MatchingService(
        users=SqlUserRepo(db),
        matches=SqlMatchRepo(db),
        sessions=SqlFocusSessionRepo(db),
        strategy=SimpleOverlapStrategy(),
        events=events,
        ids=ids,
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
    svc = _service(db, ids, events, clock)
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
    svc = _service(db, ids, events, clock)
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
    svc = _service(db, ids, events, clock)
    match = await svc.skip(match_id=match_id, user_id=user_id)
    users: IUserReader = SqlUserRepo(db)
    return await _dto(match, users)


@router.get("/recent", response_model=list[MatchResponse])
async def recent_matches(user_id: CurrentUserId, db: DbDep) -> list[MatchResponse]:
    repo: IMatchReader = SqlMatchRepo(db)
    users: IUserReader = SqlUserRepo(db)
    matches = await repo.list_recent_for_user(user_id=user_id, limit=20)
    if not matches:
        return []
    user_ids = list(
        {m.requester_id for m in matches} | {m.candidate_id for m in matches}
    )
    fetched = await users.get_many_by_ids(user_ids)
    cache: dict[str, str | None] = {u.id: u.character_key for u in fetched}
    # Mark misses as None so _dto's cache short-circuits instead of re-querying.
    for uid in user_ids:
        cache.setdefault(uid, None)
    return [await _dto(m, users, cache=cache) for m in matches]


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


@router.post("/auto", response_model=MatchResponse, status_code=201)
async def auto_match(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
    clock: ClockDep,
    tracker: PresenceTrackerDep,
) -> MatchResponse:
    """One-shot matching for the frontend MatchCTA button.

    Picks a candidate using a real-first-then-bot policy:

    1. **Real human pool**: anyone currently ``on_street`` (excluding the
       requester and anyone the requester matched recently). Returns a
       PENDING match — the real candidate must accept via the existing
       ``/matches/{id}/accept`` endpoint, which fires
       ``match.proposed`` on their WebSocket.
    2. **Bot fallback**: if no eligible real humans are online, pick a
       bot the requester hasn't matched recently. Because the bot has
       no client, the server immediately calls ``accept`` on the bot's
       behalf so the requester can transition straight into the focus
       room.

    The bot auto-accept lives **only here** — keeping
    ``MatchingService.propose``'s ``PENDING`` invariant untouched (OCP).
    """
    users: IUserReader = SqlUserRepo(db)
    matches_reader: IMatchReader = SqlMatchRepo(db)
    svc = _service(db, ids, events, clock)

    recent = await matches_reader.list_recent_for_user(
        user_id=user_id, limit=_RECENT_DEDUP_WINDOW
    )
    recent_candidate_ids = {
        m.candidate_id if m.requester_id == user_id else m.requester_id
        for m in recent
    }

    # Step 1: real humans currently on the street
    on_street = await tracker.list(state="on_street")
    online_ids = [e.user_id for e in on_street if e.user_id != user_id]
    online_users = await users.get_many_by_ids(online_ids)
    real_pool = [
        u for u in online_users
        if not u.is_bot and u.id not in recent_candidate_ids and u.is_active
    ]
    if real_pool:
        chosen = random.choice(real_pool)  # noqa: S311
        match = await svc.propose(requester_id=user_id, candidate_id=chosen.id)
        return await _dto(match, users, cache={chosen.id: chosen.character_key})

    # Step 2: bot fallback
    bots = await users.list_bots()
    if not bots:
        raise ConflictError("no_match_candidate_available")
    bot_pool = [b for b in bots if b.id not in recent_candidate_ids] or bots
    chosen = random.choice(bot_pool)  # noqa: S311
    match = await svc.propose(requester_id=user_id, candidate_id=chosen.id)
    accepted = await svc.accept(match_id=match.id, user_id=chosen.id)
    return await _dto(accepted, users, cache={chosen.id: chosen.character_key})
