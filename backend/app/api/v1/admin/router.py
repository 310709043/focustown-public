from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.api.v1.admin.schemas import (
    AdminFeedbackDetail,
    AdminFeedbackItem,
    AdminFeedbackList,
    AdminUserItem,
    AdminUserList,
    BanResponse,
    FeedbackStatusUpdate,
    OverviewStats,
)
from app.core.deps import ClockDep, DbDep, IdGenDep
from app.core.exceptions import NotFoundError
from app.infrastructure.db.models.feedback import FeedbackSubmissionORM
from app.infrastructure.db.models.focus_session import FocusSessionORM
from app.infrastructure.db.models.match_waiting_pool import MatchWaitingPoolORM
from app.infrastructure.db.models.user import UserORM
from app.infrastructure.db.models.user import UserORM

router = APIRouter()


# ── Overview ────────────────────────────────────────────────────────────


@router.get("/overview", response_model=OverviewStats)
async def get_overview(
    db: DbDep,
) -> OverviewStats:
    """Dashboard summary statistics."""

    # Total users
    total_users = (await db.execute(select(func.count(UserORM.id)))).scalar_one()

    # Active today: distinct users who had a focus session starting today
    active_today = (
        await db.execute(
            select(func.count(func.distinct(FocusSessionORM.user_id))).where(
                func.date(FocusSessionORM.started_at) == func.current_date()
            )
        )
    ).scalar_one()

    # Sessions today + avg duration
    sessions_row = (
        await db.execute(
            select(
                func.count(FocusSessionORM.id),
                func.coalesce(func.avg(FocusSessionORM.elapsed_seconds), 0),
            ).where(func.date(FocusSessionORM.started_at) == func.current_date())
        )
    ).one()
    sessions_today = sessions_row[0]
    avg_duration = float(sessions_row[1])

    # Match queue depth
    queue_depth = (
        await db.execute(
            select(func.count(MatchWaitingPoolORM.user_id)).where(
                MatchWaitingPoolORM.status == "waiting"
            )
        )
    ).scalar_one()

    # New feedback count
    new_feedback = (
        await db.execute(
            select(func.count(FeedbackSubmissionORM.id)).where(
                FeedbackSubmissionORM.status == "new"
            )
        )
    ).scalar_one()

    return OverviewStats(
        total_users=total_users,
        active_today=active_today,
        online_now=0,
        sessions_today=sessions_today,
        avg_duration_seconds=round(avg_duration, 1),
        match_queue_depth=queue_depth,
        new_feedback_count=new_feedback,
    )


# ── Users ───────────────────────────────────────────────────────────────


@router.get("/users", response_model=AdminUserList)
async def list_users(
    db: DbDep,
    q: str = Query("", max_length=128),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminUserList:
    """Paginated user list with optional search by email or display_name."""

    base = select(UserORM)
    count_base = select(func.count(UserORM.id))

    if q.strip():
        pattern = f"%{q.strip()}%"
        filter_clause = UserORM.email.ilike(pattern) | UserORM.display_name.ilike(
            pattern
        )
        base = base.where(filter_clause)
        count_base = count_base.where(filter_clause)

    total = (await db.execute(count_base)).scalar_one()

    offset = (page - 1) * size
    rows = (
        (
            await db.execute(
                base.order_by(UserORM.created_at.desc()).offset(offset).limit(size)
            )
        )
        .scalars()
        .all()
    )

    # Batch-fetch last focus session dates for the page of users
    user_ids = [r.id for r in rows]
    last_focus_map: dict[str, object] = {}
    if user_ids:
        last_focus_rows = (
            await db.execute(
                select(
                    FocusSessionORM.user_id,
                    func.max(FocusSessionORM.started_at).label("last_focus_at"),
                )
                .where(FocusSessionORM.user_id.in_(user_ids))
                .group_by(FocusSessionORM.user_id)
            )
        ).all()
        last_focus_map = {r[0]: r[1] for r in last_focus_rows}

    items = [
        AdminUserItem(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            character_key=u.character_key,
            is_active=u.is_active,
            created_at=u.created_at,
            last_focus_at=last_focus_map.get(u.id),
        )
        for u in rows
    ]

    return AdminUserList(items=items, total=total, page=page, size=size)


# ── Ban / Unban ─────────────────────────────────────────────────────────


async def _set_user_active(db: DbDep, user_id: str, *, active: bool) -> BanResponse:
    user = await db.get(UserORM, user_id)
    if user is None:
        raise NotFoundError("user_not_found")
    user.is_active = active
    await db.flush()
    return BanResponse(id=user.id, is_active=user.is_active)


@router.post("/users/{user_id}/ban", response_model=BanResponse)
async def ban_user(
    user_id: str,
    db: DbDep,
) -> BanResponse:
    """Deactivate a user account."""
    return await _set_user_active(db, user_id, active=False)


@router.post("/users/{user_id}/unban", response_model=BanResponse)
async def unban_user(
    user_id: str,
    db: DbDep,
) -> BanResponse:
    """Reactivate a user account."""
    return await _set_user_active(db, user_id, active=True)


# ── Feedback ────────────────────────────────────────────────────────────

_VALID_FEEDBACK_STATUSES = {"new", "reviewed", "resolved"}


@router.get("/feedback", response_model=AdminFeedbackList)
async def list_feedback(
    db: DbDep,
    status: str | None = Query(None, pattern=r"^(new|reviewed|resolved)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminFeedbackList:
    """Paginated feedback list, optionally filtered by status."""

    base = select(FeedbackSubmissionORM)
    count_base = select(func.count(FeedbackSubmissionORM.id))

    if status:
        base = base.where(FeedbackSubmissionORM.status == status)
        count_base = count_base.where(FeedbackSubmissionORM.status == status)

    total = (await db.execute(count_base)).scalar_one()

    offset = (page - 1) * size
    rows = (
        (
            await db.execute(
                base.order_by(FeedbackSubmissionORM.created_at.desc())
                .offset(offset)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )

    items = [
        AdminFeedbackItem(
            id=r.id,
            user_id=r.user_id,
            category=r.category,
            body=r.body,
            contact_email=r.contact_email,
            status=r.status,
            locale=r.locale,
            app_version=r.app_version,
            created_at=r.created_at,
        )
        for r in rows
    ]

    return AdminFeedbackList(items=items, total=total, page=page, size=size)


@router.patch("/feedback/{feedback_id}", response_model=AdminFeedbackDetail)
async def update_feedback_status(
    feedback_id: str,
    payload: FeedbackStatusUpdate,
    db: DbDep,
) -> AdminFeedbackDetail:
    """Transition feedback status (new -> reviewed -> resolved)."""

    row = await db.get(FeedbackSubmissionORM, feedback_id)
    if row is None:
        raise NotFoundError("feedback_not_found")

    if payload.status not in _VALID_FEEDBACK_STATUSES:
        raise NotFoundError("invalid_status")

    row.status = payload.status
    await db.flush()

    return AdminFeedbackDetail(
        id=row.id,
        status=row.status,
        updated_at=row.updated_at,
    )


# ── Temporary: Seed leaderboard test data ──────────────────────────────

TEST_USERS = [
    ("Alice", 4, 25),
    ("Bob", 3, 20),
    ("Charlie", 2, 30),
    ("Diana", 5, 15),
    ("Eve", 1, 25),
]


@router.post("/seed-leaderboard")
async def seed_leaderboard(db: DbDep, clock: ClockDep, ids: IdGenDep):
    """Temporary: seed today's focus sessions for leaderboard testing."""
    now = clock.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    created = 0

    for display_name, session_count, avg_minutes in TEST_USERS:
        result = await db.execute(
            select(UserORM).where(UserORM.display_name == display_name)
        )
        user = result.scalar_one_or_none()

        if user is None:
            user_id = ids.new_id()
            user = UserORM(
                id=user_id,
                email=f"{display_name.lower()}@test.local",
                display_name=display_name,
                password_hash="!",
                is_active=True,
                is_bot=False,
            )
            db.add(user)
            await db.flush()

        for _ in range(session_count):
            seconds_today = int((now - today_start).total_seconds())
            random_offset = random.randint(0, max(0, seconds_today - 1800))
            started_at = today_start + timedelta(seconds=random_offset)
            duration = avg_minutes * 60 + random.randint(-300, 300)
            duration = max(300, duration)

            session = FocusSessionORM(
                id=ids.new_id(),
                user_id=user.id,
                mode="focus",
                duration_seconds=duration,
                elapsed_seconds=duration,
                status="completed",
                started_at=started_at,
                ended_at=started_at + timedelta(seconds=duration),
            )
            db.add(session)
            created += 1

    await db.flush()
    return {"ok": True, "created": created}
