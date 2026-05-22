from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.api.v1._common.pagination import Page, build_page
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


# Catalog seeds may pre-date the cursor migration without a created_at;
# treating those as epoch keeps the cursor stable across SQLite (unit) and
# Postgres (integration) backends.
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _ach_key(a: AchievementRecord) -> tuple[datetime, str]:
    return (a.created_at or _EPOCH, a.code)


@router.get("", response_model=Page[AchievementResponse])
async def list_all(
    db: DbDep,
    cursor: str | None = Query(None, max_length=256),
    limit: int = Query(50, ge=1, le=100),
) -> Page[AchievementResponse]:
    repo = SqlAchievementRepo(db)
    rows = await repo.list_all(cursor=cursor, limit=limit)
    return build_page(rows, limit=limit, key=_ach_key, to_item=_to_response)


@router.get("/me", response_model=Page[AchievementResponse])
async def list_mine(
    user_id: CurrentUserId,
    db: DbDep,
    cursor: str | None = Query(None, max_length=256),
    limit: int = Query(50, ge=1, le=100),
) -> Page[AchievementResponse]:
    repo = SqlAchievementRepo(db)
    rows = await repo.list_for_user(user_id, cursor=cursor, limit=limit)
    return build_page(rows, limit=limit, key=_ach_key, to_item=_to_response)
