from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.leaderboard.schemas import LeaderboardEntryResponse
from app.core.deps import ClockDep, DbDep
from app.domain.services.leaderboard_service import LeaderboardService
from app.infrastructure.db.repositories import SqlFocusSessionRepo, SqlUserRepo

router = APIRouter()


@router.get("/today", response_model=list[LeaderboardEntryResponse])
async def today(db: DbDep, clock: ClockDep) -> list[LeaderboardEntryResponse]:
    svc = LeaderboardService(
        sessions=SqlFocusSessionRepo(db), users=SqlUserRepo(db), clock=clock
    )
    entries = await svc.today(limit=10)
    return [
        LeaderboardEntryResponse(
            user_id=e.user.id,
            display_name=e.user.public_name(),
            character_key=e.user.character_key,
            completed_count=e.completed_count,
        )
        for e in entries
    ]
