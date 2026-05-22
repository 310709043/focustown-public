from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter

from app.api.v1.users.schemas import (
    ProfileUpdateRequest,
    PublicUserProfile,
    UserResponse,
    UserStatsResponse,
)
from app.core.deps import CurrentUserId, DbDep
from app.core.exceptions import NotFoundError
from app.domain.services.leveling import XP_PER_LEVEL, compute_level, compute_xp
from app.infrastructure.db.repositories import SqlFocusSessionRepo, SqlUserRepo

router = APIRouter()


def _week_start_utc(now: datetime) -> datetime:
    """Monday 00:00 UTC of the calendar week containing ``now``."""
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight - timedelta(days=midnight.weekday())


async def _current_streak_days(repo: SqlFocusSessionRepo, *, user_id: str) -> int:
    # Walk back day-by-day from today UTC. The streak breaks at the first
    # day without a completed focus session. Cap at 365 to keep the query
    # bounded even if a (future) user has a 2-year run.
    horizon = datetime.now(UTC) - timedelta(days=365)
    days = await repo.completed_focus_days_since(user_id=user_id, since=horizon)
    if not days:
        return 0
    # Normalize each returned datetime to its UTC calendar day, deduped.
    day_set = {d.replace(hour=0, minute=0, second=0, microsecond=0).date() for d in days}
    today = datetime.now(UTC).date()
    streak = 0
    cursor = today
    # Allow the streak to start either today or yesterday — same-day grace
    # so a user opening profile at 00:05 UTC without a focus yet still sees
    # yesterday's streak intact.
    if today not in day_set and (today - timedelta(days=1)) in day_set:
        cursor = today - timedelta(days=1)
    while cursor in day_set and streak < 365:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return streak


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_my_stats(
    user_id: CurrentUserId,
    db: DbDep,
) -> UserStatsResponse:
    """Dashboard aggregates for the signed-in user.

    All values derive from the user's own `focus_sessions` rows
    (``status='completed' AND mode='focus'``). A brand-new account
    receives an all-zero response — the frontend then renders the
    matching empty states (rank "—", empty heatmap, level 1 / XP 0).
    """
    sessions = SqlFocusSessionRepo(db)
    now = datetime.now(UTC)
    week_start = _week_start_utc(now)
    totals = await sessions.user_totals(user_id=user_id, week_start=week_start)
    heatmap = await sessions.weekly_heatmap(user_id=user_id, week_start=week_start)
    streak = await _current_streak_days(sessions, user_id=user_id)
    weekly_rank = await sessions.weekly_rank(user_id=user_id, week_start=week_start)
    return UserStatsResponse(
        total_tomatoes=totals.completed_focus_count,
        all_time_focus_hours=round(totals.completed_focus_seconds / 3600, 1),
        week_total_hours=round(totals.week_focus_seconds / 3600, 1),
        streak_days=streak,
        weekly_rank=weekly_rank,
        heatmap=heatmap,
        level=compute_level(totals.completed_focus_seconds),
        xp=compute_xp(totals.completed_focus_seconds),
        xp_next_level=XP_PER_LEVEL,
    )


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

    Today's focus minutes is derived from completed-pomodoro count * 25
    so the value lines up with what the leaderboard widget shows.
    """
    user_repo = SqlUserRepo(db)
    sessions_repo = SqlFocusSessionRepo(db)
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise NotFoundError("user_not_found")
    now = datetime.now(UTC)
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
