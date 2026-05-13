from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter

from app.api.v1.achievements.schemas import AchievementResponse
from app.core.deps import CurrentUserId, DbDep
from app.infrastructure.db.repositories import SqlAchievementRepo

router = APIRouter()


# AchievementRecord is a slots=True dataclass → no __dict__; use asdict().


@router.get("", response_model=list[AchievementResponse])
async def list_all(db: DbDep) -> list[AchievementResponse]:
    repo = SqlAchievementRepo(db)
    return [AchievementResponse(**asdict(a)) for a in await repo.list_all()]


@router.get("/me", response_model=list[AchievementResponse])
async def list_mine(user_id: CurrentUserId, db: DbDep) -> list[AchievementResponse]:
    repo = SqlAchievementRepo(db)
    return [AchievementResponse(**asdict(a)) for a in await repo.list_for_user(user_id)]
