from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.matches.schemas import MatchResponse, ProposeMatchRequest
from app.core.deps import CurrentUserId, DbDep, EventBusDep, IdGenDep
from app.domain.models import Match
from app.domain.services.matching_service import MatchingService
from app.domain.services.strategies import SimpleOverlapStrategy
from app.infrastructure.db.repositories import (
    SqlFocusSessionRepo,
    SqlMatchRepo,
    SqlUserRepo,
)

router = APIRouter()


def _dto(m: Match) -> MatchResponse:
    return MatchResponse(
        id=m.id,
        requester_id=m.requester_id,
        candidate_id=m.candidate_id,
        compatibility=m.compatibility,
        reason=m.reason,
        status=m.status,
        created_at=m.created_at,
    )


def _service(db, ids, events) -> MatchingService:
    return MatchingService(
        users=SqlUserRepo(db),
        matches=SqlMatchRepo(db),
        sessions=SqlFocusSessionRepo(db),
        strategy=SimpleOverlapStrategy(),
        events=events,
        ids=ids,
    )


@router.post("", response_model=MatchResponse, status_code=201)
async def propose_match(
    payload: ProposeMatchRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
) -> MatchResponse:
    svc = _service(db, ids, events)
    match = await svc.propose(requester_id=user_id, candidate_id=payload.candidate_id)
    return _dto(match)


@router.post("/{match_id}/accept", response_model=MatchResponse)
async def accept_match(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
) -> MatchResponse:
    svc = _service(db, ids, events)
    return _dto(await svc.accept(match_id=match_id, user_id=user_id))


@router.post("/{match_id}/skip", response_model=MatchResponse)
async def skip_match(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    events: EventBusDep,
) -> MatchResponse:
    svc = _service(db, ids, events)
    return _dto(await svc.skip(match_id=match_id, user_id=user_id))


@router.get("/recent", response_model=list[MatchResponse])
async def recent_matches(user_id: CurrentUserId, db: DbDep) -> list[MatchResponse]:
    repo = SqlMatchRepo(db)
    return [_dto(m) for m in await repo.list_recent_for_user(user_id=user_id, limit=20)]
