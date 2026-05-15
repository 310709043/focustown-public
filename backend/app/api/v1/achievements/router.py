from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.achievements.schemas import AchievementResponse
from app.core.deps import CurrentUserId, DbDep
from app.domain.repositories.achievement_repo import AchievementRecord
from app.infrastructure.db.repositories import SqlAchievementRepo

router = APIRouter()


def _to_response(a: AchievementRecord) -> AchievementResponse:
    return AchievementResponse(
        code=a.code,
        icon=a.icon,
        title=a.title,
        description=a.description,
    )


@router.get("", response_model=list[AchievementResponse])
async def list_all(db: DbDep) -> list[AchievementResponse]:
    repo = SqlAchievementRepo(db)
    return [_to_response(a) for a in await repo.list_all()]


@router.get("/me", response_model=list[AchievementResponse])
async def list_mine(user_id: CurrentUserId, db: DbDep) -> list[AchievementResponse]:
    repo = SqlAchievementRepo(db)
    return [_to_response(a) for a in await repo.list_for_user(user_id)]
