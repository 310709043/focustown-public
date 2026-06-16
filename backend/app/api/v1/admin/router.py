from __future__ import annotations

import csv
import io
import random
from datetime import timedelta

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select

from app.api.v1.admin.schemas import (
    AdminAnnouncementCreate,
    AdminAnnouncementItem,
    AdminAnnouncementList,
    AdminAnnouncementUpdate,
    AdminFeedbackDetail,
    AdminFeedbackItem,
    AdminFeedbackList,
    AdminMatchItem,
    AdminMatchList,
    AdminMessageItem,
    AdminMessageList,
    AdminSessionForceEnd,
    AdminSessionItem,
    AdminSessionList,
    AdminUserItem,
    AdminUserList,
    AdminWalletDistribution,
    AdminWalletDistributionBucket,
    AdminWalletTxItem,
    AdminWalletTxList,
    BanResponse,
    FeedbackStatusUpdate,
    OverviewStats,
)
from app.core.deps import AdminUserId, ClockDep, DbDep, IdGenDep
from app.core.exceptions import NotFoundError
from app.infrastructure.db.models.announcement import AnnouncementORM
from app.infrastructure.db.models.feedback import FeedbackSubmissionORM
from app.infrastructure.db.models.focus_session import FocusSessionORM
from app.infrastructure.db.models.match import MatchORM
from app.infrastructure.db.models.match_realtime import MatchMessageORM
from app.infrastructure.db.models.match_waiting_pool import MatchWaitingPoolORM
from app.infrastructure.db.models.user import UserORM
from app.infrastructure.db.models.wallet import WalletORM
from app.infrastructure.db.models.wallet_transaction import WalletTransactionORM

router = APIRouter()


# ── Overview ────────────────────────────────────────────────────────────


@router.get("/overview", response_model=OverviewStats)
async def get_overview(
    _admin: AdminUserId,
    db: DbDep,
) -> OverviewStats:
    """Dashboard summary statistics."""

    total_users = (await db.execute(select(func.count(UserORM.id)))).scalar_one()

    active_today = (
        await db.execute(
            select(func.count(func.distinct(FocusSessionORM.user_id))).where(
                func.date(FocusSessionORM.started_at) == func.current_date()
            )
        )
    ).scalar_one()

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

    queue_depth = (
        await db.execute(
            select(func.count(MatchWaitingPoolORM.user_id)).where(
                MatchWaitingPoolORM.status == "waiting"
            )
        )
    ).scalar_one()

    new_feedback = (
        await db.execute(
            select(func.count(FeedbackSubmissionORM.id)).where(
                FeedbackSubmissionORM.status == "new"
            )
        )
    ).scalar_one()

    active_sessions = (
        await db.execute(
            select(func.count(FocusSessionORM.id)).where(
                FocusSessionORM.status == "active"
            )
        )
    ).scalar_one()

    total_matches = (
        await db.execute(
            select(func.count(MatchORM.id)).where(
                func.date(MatchORM.created_at) == func.current_date()
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
        active_sessions=active_sessions,
        matches_today=total_matches,
    )


# ── Users ───────────────────────────────────────────────────────────────


@router.get("/users", response_model=AdminUserList)
async def list_users(
    _admin: AdminUserId,
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
    _admin: AdminUserId,
    db: DbDep,
) -> BanResponse:
    return await _set_user_active(db, user_id, active=False)


@router.post("/users/{user_id}/unban", response_model=BanResponse)
async def unban_user(
    user_id: str,
    _admin: AdminUserId,
    db: DbDep,
) -> BanResponse:
    return await _set_user_active(db, user_id, active=True)


# ── Sessions ────────────────────────────────────────────────────────────


@router.get("/sessions", response_model=AdminSessionList)
async def list_sessions(
    _admin: AdminUserId,
    db: DbDep,
    status: str | None = Query(None, pattern=r"^(active|completed|abandoned|cancelled)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminSessionList:
    """Paginated session list, optionally filtered by status."""

    base = select(
        FocusSessionORM,
        UserORM.display_name.label("user_display_name"),
    ).outerjoin(UserORM, FocusSessionORM.user_id == UserORM.id)
    count_base = select(func.count(FocusSessionORM.id))

    if status:
        base = base.where(FocusSessionORM.status == status)
        count_base = count_base.where(FocusSessionORM.status == status)

    total = (await db.execute(count_base)).scalar_one()
    offset = (page - 1) * size
    rows = (
        await db.execute(
            base.order_by(FocusSessionORM.started_at.desc()).offset(offset).limit(size)
        )
    ).all()

    items = [
        AdminSessionItem(
            id=r.FocusSessionORM.id,
            user_id=r.FocusSessionORM.user_id,
            user_display_name=r.user_display_name,
            mode=r.FocusSessionORM.mode,
            duration_seconds=r.FocusSessionORM.duration_seconds,
            elapsed_seconds=r.FocusSessionORM.elapsed_seconds,
            status=r.FocusSessionORM.status,
            task_label=r.FocusSessionORM.task_label,
            started_at=r.FocusSessionORM.started_at,
            ended_at=r.FocusSessionORM.ended_at,
        )
        for r in rows
    ]

    return AdminSessionList(items=items, total=total, page=page, size=size)


@router.post("/sessions/{session_id}/force-end")
async def force_end_session(
    session_id: str,
    _admin: AdminUserId,
    db: DbDep,
    clock: ClockDep,
) -> AdminSessionForceEnd:
    """Force-end an active session (admin override)."""
    session = await db.get(FocusSessionORM, session_id)
    if session is None:
        raise NotFoundError("session_not_found")
    if session.status != "active":
        return AdminSessionForceEnd(id=session.id, status=session.status, already_ended=True)
    session.status = "abandoned"
    session.ended_at = clock.now()
    await db.flush()
    return AdminSessionForceEnd(id=session.id, status=session.status, already_ended=False)


# ── Economy / Wallet ────────────────────────────────────────────────────


@router.get("/economy/transactions", response_model=AdminWalletTxList)
async def list_wallet_transactions(
    _admin: AdminUserId,
    db: DbDep,
    user_id: str | None = Query(None),
    reason: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminWalletTxList:
    """Paginated wallet transaction ledger."""

    base = select(
        WalletTransactionORM,
        UserORM.display_name.label("user_display_name"),
    ).outerjoin(UserORM, WalletTransactionORM.user_id == UserORM.id)
    count_base = select(func.count(WalletTransactionORM.id))

    if user_id:
        base = base.where(WalletTransactionORM.user_id == user_id)
        count_base = count_base.where(WalletTransactionORM.user_id == user_id)
    if reason:
        base = base.where(WalletTransactionORM.reason == reason)
        count_base = count_base.where(WalletTransactionORM.reason == reason)

    total = (await db.execute(count_base)).scalar_one()
    offset = (page - 1) * size
    rows = (
        await db.execute(
            base.order_by(WalletTransactionORM.created_at.desc()).offset(offset).limit(size)
        )
    ).all()

    items = [
        AdminWalletTxItem(
            id=r.WalletTransactionORM.id,
            user_id=r.WalletTransactionORM.user_id,
            user_display_name=r.user_display_name,
            currency_code=r.WalletTransactionORM.currency_code,
            delta_minor=r.WalletTransactionORM.delta_minor,
            reason=r.WalletTransactionORM.reason,
            balance_after_minor=r.WalletTransactionORM.balance_after_minor,
            created_at=r.WalletTransactionORM.created_at,
        )
        for r in rows
    ]

    return AdminWalletTxList(items=items, total=total, page=page, size=size)


@router.get("/economy/distribution", response_model=AdminWalletDistribution)
async def wallet_distribution(
    _admin: AdminUserId,
    db: DbDep,
) -> AdminWalletDistribution:
    """T-coin balance distribution across users (buckets)."""

    total_supply = (
        await db.execute(
            select(func.coalesce(func.sum(WalletORM.balance_minor), 0)).where(
                WalletORM.currency_code == "T"
            )
        )
    ).scalar_one()

    holder_count = (
        await db.execute(
            select(func.count(WalletORM.id)).where(
                WalletORM.currency_code == "T",
                WalletORM.balance_minor > 0,
            )
        )
    ).scalar_one()

    # Bucket distribution: 0, 1-99, 100-499, 500-999, 1000+
    bucket_label = case(
        (WalletORM.balance_minor == 0, "0"),
        (WalletORM.balance_minor < 100, "1-99"),
        (WalletORM.balance_minor < 500, "100-499"),
        (WalletORM.balance_minor < 1000, "500-999"),
        else_="1000+",
    )
    bucket_rows = (
        await db.execute(
            select(bucket_label.label("bucket"), func.count(WalletORM.id))
            .where(WalletORM.currency_code == "T")
            .group_by(bucket_label)
        )
    ).all()

    buckets = [
        AdminWalletDistributionBucket(label=r[0], count=r[1]) for r in bucket_rows
    ]

    return AdminWalletDistribution(
        total_supply_minor=int(total_supply),
        holder_count=holder_count,
        buckets=buckets,
    )


# ── Matches ─────────────────────────────────────────────────────────────


@router.get("/matches", response_model=AdminMatchList)
async def list_matches(
    _admin: AdminUserId,
    db: DbDep,
    status: str | None = Query(None, pattern=r"^(pending|accepted|skipped|expired)$"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminMatchList:
    """Paginated match history."""

    # Alias for the two user joins
    requester_t = UserORM.__table__.alias("requester")
    candidate_t = UserORM.__table__.alias("candidate")

    base = (
        select(
            MatchORM,
            requester_t.c.display_name.label("requester_name"),
            candidate_t.c.display_name.label("candidate_name"),
        )
        .outerjoin(requester_t, MatchORM.requester_id == requester_t.c.id)
        .outerjoin(candidate_t, MatchORM.candidate_id == candidate_t.c.id)
    )
    count_base = select(func.count(MatchORM.id))

    if status:
        base = base.where(MatchORM.status == status)
        count_base = count_base.where(MatchORM.status == status)

    total = (await db.execute(count_base)).scalar_one()
    offset = (page - 1) * size
    rows = (
        await db.execute(
            base.order_by(MatchORM.created_at.desc()).offset(offset).limit(size)
        )
    ).all()

    items = [
        AdminMatchItem(
            id=r.MatchORM.id,
            requester_id=r.MatchORM.requester_id,
            requester_name=r.requester_name,
            candidate_id=r.MatchORM.candidate_id,
            candidate_name=r.candidate_name,
            compatibility=r.MatchORM.compatibility,
            status=r.MatchORM.status,
            created_at=r.MatchORM.created_at,
        )
        for r in rows
    ]

    return AdminMatchList(items=items, total=total, page=page, size=size)


# ── Chat Moderation ─────────────────────────────────────────────────────


@router.get("/messages", response_model=AdminMessageList)
async def list_messages(
    _admin: AdminUserId,
    db: DbDep,
    match_id: str | None = Query(None),
    sender_id: str | None = Query(None),
    q: str = Query("", max_length=256),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminMessageList:
    """Paginated chat message list for content moderation."""

    base = select(
        MatchMessageORM,
        UserORM.display_name.label("sender_name"),
    ).outerjoin(UserORM, MatchMessageORM.sender_id == UserORM.id)
    count_base = select(func.count(MatchMessageORM.id))

    if match_id:
        base = base.where(MatchMessageORM.match_id == match_id)
        count_base = count_base.where(MatchMessageORM.match_id == match_id)
    if sender_id:
        base = base.where(MatchMessageORM.sender_id == sender_id)
        count_base = count_base.where(MatchMessageORM.sender_id == sender_id)
    if q.strip():
        pattern = f"%{q.strip()}%"
        base = base.where(MatchMessageORM.body.ilike(pattern))
        count_base = count_base.where(MatchMessageORM.body.ilike(pattern))

    total = (await db.execute(count_base)).scalar_one()
    offset = (page - 1) * size
    rows = (
        await db.execute(
            base.order_by(MatchMessageORM.created_at.desc()).offset(offset).limit(size)
        )
    ).all()

    items = [
        AdminMessageItem(
            id=r.MatchMessageORM.id,
            match_id=r.MatchMessageORM.match_id,
            sender_id=r.MatchMessageORM.sender_id,
            sender_name=r.sender_name,
            kind=r.MatchMessageORM.kind,
            body=r.MatchMessageORM.body,
            created_at=r.MatchMessageORM.created_at,
        )
        for r in rows
    ]

    return AdminMessageList(items=items, total=total, page=page, size=size)


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    _admin: AdminUserId,
    db: DbDep,
) -> dict:
    """Delete an inappropriate chat message."""
    msg = await db.get(MatchMessageORM, message_id)
    if msg is None:
        raise NotFoundError("message_not_found")
    await db.delete(msg)
    await db.flush()
    return {"ok": True, "deleted_id": message_id}


# ── Feedback ────────────────────────────────────────────────────────────

_VALID_FEEDBACK_STATUSES = {"new", "reviewed", "resolved"}


@router.get("/feedback", response_model=AdminFeedbackList)
async def list_feedback(
    _admin: AdminUserId,
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
    _admin: AdminUserId,
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


# ── Announcements ──────────────────────────────────────────────────────


@router.get("/announcements", response_model=AdminAnnouncementList)
async def list_announcements(
    _admin: AdminUserId,
    db: DbDep,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
) -> AdminAnnouncementList:
    total = (
        await db.execute(select(func.count(AnnouncementORM.id)))
    ).scalar_one()
    offset = (page - 1) * size
    rows = (
        (
            await db.execute(
                select(AnnouncementORM)
                .order_by(AnnouncementORM.created_at.desc())
                .offset(offset)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    items = [
        AdminAnnouncementItem(
            id=r.id,
            title=r.title,
            body=r.body,
            is_active=r.is_active,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return AdminAnnouncementList(items=items, total=total, page=page, size=size)


@router.post("/announcements", response_model=AdminAnnouncementItem)
async def create_announcement(
    payload: AdminAnnouncementCreate,
    admin_id: AdminUserId,
    db: DbDep,
    ids: IdGenDep,
) -> AdminAnnouncementItem:
    row = AnnouncementORM(
        id=ids.new_id(),
        author_id=admin_id,
        title=payload.title,
        body=payload.body,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    return AdminAnnouncementItem(
        id=row.id,
        title=row.title,
        body=row.body,
        is_active=row.is_active,
        created_at=row.created_at,
    )


@router.patch("/announcements/{announcement_id}", response_model=AdminAnnouncementItem)
async def update_announcement(
    announcement_id: str,
    payload: AdminAnnouncementUpdate,
    _admin: AdminUserId,
    db: DbDep,
) -> AdminAnnouncementItem:
    row = await db.get(AnnouncementORM, announcement_id)
    if row is None:
        raise NotFoundError("announcement_not_found")
    if payload.title is not None:
        row.title = payload.title
    if payload.body is not None:
        row.body = payload.body
    if payload.is_active is not None:
        row.is_active = payload.is_active
    await db.flush()
    return AdminAnnouncementItem(
        id=row.id,
        title=row.title,
        body=row.body,
        is_active=row.is_active,
        created_at=row.created_at,
    )


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    _admin: AdminUserId,
    db: DbDep,
) -> dict:
    row = await db.get(AnnouncementORM, announcement_id)
    if row is None:
        raise NotFoundError("announcement_not_found")
    await db.delete(row)
    await db.flush()
    return {"ok": True, "deleted_id": announcement_id}


# ── Data Export ──────────────────────────────────────────────────────────


@router.get("/export/users")
async def export_users_csv(
    _admin: AdminUserId,
    db: DbDep,
) -> StreamingResponse:
    """Export all users as CSV."""
    rows = (
        (await db.execute(select(UserORM).order_by(UserORM.created_at.desc())))
        .scalars()
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "email", "display_name", "character_key", "is_active", "created_at",
    ])
    for u in rows:
        writer.writerow([
            u.id, u.email, u.display_name, u.character_key,
            u.is_active, u.created_at.isoformat(),
        ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.get("/export/sessions")
async def export_sessions_csv(
    _admin: AdminUserId,
    db: DbDep,
) -> StreamingResponse:
    """Export all focus sessions as CSV."""
    rows = (
        (await db.execute(select(FocusSessionORM).order_by(FocusSessionORM.started_at.desc())))
        .scalars()
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "user_id", "mode", "duration_seconds", "elapsed_seconds",
        "status", "task_label", "started_at", "ended_at",
    ])
    for s in rows:
        writer.writerow([
            s.id, s.user_id, s.mode, s.duration_seconds,
            s.elapsed_seconds, s.status, s.task_label,
            s.started_at.isoformat() if s.started_at else "",
            s.ended_at.isoformat() if s.ended_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sessions.csv"},
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
async def seed_leaderboard(
    _admin: AdminUserId,
    db: DbDep,
    clock: ClockDep,
    ids: IdGenDep,
):
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
