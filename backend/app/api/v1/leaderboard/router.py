from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.leaderboard.schemas import LeaderboardEntryResponse
from app.core.deps import (
    ClientIpDep,
    ClockDep,
    DbDep,
    RateLimiterDep,
    SettingsDep,
)
from app.core.exceptions import RateLimitedError
from app.domain.services.leaderboard_service import LeaderboardService
from app.infrastructure.db.repositories import SqlFocusSessionRepo, SqlUserRepo

router = APIRouter()


@router.get("/today", response_model=list[LeaderboardEntryResponse])
async def today(
    db: DbDep,
    clock: ClockDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> list[LeaderboardEntryResponse]:
    # Public endpoint; full top-20 query touches every active session today.
    # Cheap to scrape, expensive to serve — cap per-IP.
    decision = await limiter.hit(
        f"lb:ip:{client_ip or 'unknown'}",
        limit=settings.read_rl_leaderboard_per_ip_per_min,
        window_seconds=60,
    )
    if not decision.allowed:
        raise RateLimitedError("rate_limited")
    svc = LeaderboardService(
        sessions=SqlFocusSessionRepo(db), users=SqlUserRepo(db), clock=clock
    )
    entries = await svc.today(limit=20)
    return [
        LeaderboardEntryResponse(
            user_id=e.user.id,
            display_name=e.user.public_name(),
            character_key=e.user.character_key,
            total_seconds=e.total_seconds,
        )
        for e in entries
    ]
