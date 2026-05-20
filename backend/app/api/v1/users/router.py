from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.api.v1.users.schemas import (
    ProfileUpdateRequest,
    PublicUserProfile,
    UserResponse,
)
from app.core.deps import CurrentUserId, DbDep
from app.core.exceptions import NotFoundError
from app.infrastructure.db.repositories import SqlFocusSessionRepo, SqlUserRepo

router = APIRouter()


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: ProfileUpdateRequest,
    user_id: CurrentUserId,
    db: DbDep,
) -> UserResponse:
    repo = SqlUserRepo(db)
    user = await repo.update_profile(
        user_id=user_id,
        display_name=payload.display_name,
        character_key=payload.character_key,
        role_label=payload.role_label,
    )
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        character_key=user.character_key,
        role_label=user.role_label,
    )


# NOTE: a `GET /{user_id}` returning UserResponse (with email) used to exist
# here unauthenticated. Removed 2026-05-20 — it was an open email-harvest
# endpoint and the FE only ever called `/{user_id}/public` (which is
# auth-gated and returns PublicUserProfile without email). If a future caller
# needs the full record for an authenticated viewer, prefer adding a `/me`
# self-read or extending PublicUserProfile rather than reviving this route.


@router.get("/{user_id}/public", response_model=PublicUserProfile)
async def get_public_user_profile(
    user_id: str,
    _viewer_id: CurrentUserId,
    db: DbDep,
) -> PublicUserProfile:
    """Citizen ID card data — viewable by any signed-in user.

    Surfaces only the fields the leaderboard / public profile page
    needs; never includes email, password_hash, marketing flags, or
    the `is_bot` debug flag.

    Today's focus minutes is derived from completed-pomodoro count × 25
    so the value lines up with what the leaderboard widget shows.
    """
    user_repo = SqlUserRepo(db)
    sessions_repo = SqlFocusSessionRepo(db)
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise NotFoundError("user_not_found")
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    completed_today = await sessions_repo.count_completed_today(
        user_id=user.id, day_start=day_start
    )
    return PublicUserProfile(
        id=user.id,
        display_name=user.public_name(),
        character_key=user.character_key,
        role_label=user.role_label,
        joined_at=user.created_at,
        today_focus_minutes=completed_today * 25,
    )
