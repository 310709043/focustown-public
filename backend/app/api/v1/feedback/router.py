from __future__ import annotations

import asyncio
import csv
import io
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.feedback.schemas import (
    FeedbackSubmitRequest,
    FeedbackSubmitResponse,
)
from app.core.config import Settings
from app.core.deps import (
    AdminUserId,
    ClockDep,
    CurrentUserIdOptional,
    DbDep,
    IdGenDep,
    NotifierDep,
    RateLimiterDep,
    SettingsDep,
)
from app.core.exceptions import RateLimitedError
from app.core.logging import get_logger
from app.domain.notifications import IEmailSender
from app.domain.repositories.feedback_repo import FeedbackRecord
from app.domain.services.feedback_service import FeedbackService
from app.infrastructure.db.models.feedback import FeedbackSubmissionORM
from app.infrastructure.db.models.user import UserORM
from app.infrastructure.db.repositories import SqlFeedbackRepo

# Rate-limit feedback submissions: a signed-in user can post 5 / hour;
# anonymous traffic is throttled to 10 / hour per IP. Tight enough to
# block scripted spam, loose enough that real users can iterate.
USER_LIMIT = 5
USER_WINDOW_SECONDS = 60 * 60
IP_LIMIT = 10
IP_WINDOW_SECONDS = 60 * 60

router = APIRouter()
log = get_logger(__name__)


def _service(db, ids, clock) -> FeedbackService:  # type: ignore[no-untyped-def]
    return FeedbackService(
        feedback=SqlFeedbackRepo(db),
        ids=ids,
        clock=clock,
    )


def _compose_admin_email_body(
    *,
    record: FeedbackRecord,
    submitter_display_name: str | None,
    submitter_email: str | None,
) -> str:
    """Render the plain-text body of the admin notification email.

    Plain text (not HTML) keeps the SES content simple — admins read it
    in their inbox, and HTML email costs the same per-message but adds a
    sanitisation surface we don't need.
    """
    lines = [
        f"Category: {record.category}",
        f"Submitted: {record.created_at.isoformat()}",
        f"Submitter: {submitter_display_name or '(anonymous)'}",
        f"Account email: {submitter_email or '(unknown)'}",
        f"Contact email: {record.contact_email or '(none)'}",
        f"Locale: {record.locale}",
        f"App version: {record.app_version or '(n/a)'}",
        "",
        "Message:",
        record.body,
    ]
    return "\n".join(lines)


async def _dispatch_admin_email(
    *,
    notifier: IEmailSender,
    settings: Settings,
    record: FeedbackRecord,
    submitter_display_name: str | None,
    submitter_email: str | None,
) -> None:
    """Best-effort admin notification. Logs and swallows on failure so a
    notifier outage never breaks the submit response."""
    recipient = settings.admin_feedback_email.strip()
    if not recipient:
        return
    subject = f"[FocusTown] New feedback · {record.category}"
    body = _compose_admin_email_body(
        record=record,
        submitter_display_name=submitter_display_name,
        submitter_email=submitter_email,
    )
    try:
        await notifier.send_email(to=recipient, subject=subject, body=body)
    except Exception as exc:  # pragma: no cover - depends on adapter
        log.warning("feedback_admin_email_failed", error=str(exc))


@router.post("", response_model=FeedbackSubmitResponse, status_code=201)
async def submit_feedback(
    payload: FeedbackSubmitRequest,
    request: Request,
    user_id: CurrentUserIdOptional,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    limiter: RateLimiterDep,
    notifier: NotifierDep,
    settings: SettingsDep,
) -> FeedbackSubmitResponse:
    # Pick the tighter of (user-key, ip-key) windows so anonymous spam
    # can't bypass per-user limits by signing out repeatedly.
    if user_id:
        decision = await limiter.hit(
            f"feedback:user:{user_id}",
            limit=USER_LIMIT,
            window_seconds=USER_WINDOW_SECONDS,
        )
        if not decision.allowed:
            raise RateLimitedError("rate_limited")
    else:
        ip = request.client.host if request.client else "anon"
        decision = await limiter.hit(
            f"feedback:ip:{ip}",
            limit=IP_LIMIT,
            window_seconds=IP_WINDOW_SECONDS,
        )
        if not decision.allowed:
            raise RateLimitedError("rate_limited")

    svc = _service(db, ids, clock)
    record = await svc.submit(
        user_id=user_id,
        category=payload.category,
        body=payload.body,
        contact_email=str(payload.contact_email) if payload.contact_email else None,
        locale=payload.locale,
        app_version=payload.app_version,
        context=payload.context,
    )

    # Resolve submitter identity for the admin email — display_name +
    # account email come from the users table when we have a user_id.
    submitter_display_name: str | None = None
    submitter_email: str | None = None
    if user_id:
        submitter = await db.get(UserORM, user_id)
        if submitter is not None:
            submitter_display_name = submitter.display_name
            submitter_email = submitter.email

    # Fire-and-forget the email so a slow / failing SES round trip does
    # not delay the user's submit response. The task is bound to the
    # event loop; if the worker terminates between submit + dispatch the
    # email is lost (admin still has the DB row). Keep a strong
    # reference on the request so Python doesn't GC the task mid-flight
    # (RUF006); stashing it on ``request.state`` keeps it alive until
    # the response is sent, which is well past the await above.
    request.state.feedback_email_task = asyncio.create_task(
        _dispatch_admin_email(
            notifier=notifier,
            settings=settings,
            record=record,
            submitter_display_name=submitter_display_name,
            submitter_email=submitter_email,
        )
    )
    return FeedbackSubmitResponse(
        id=record.id,
        status=record.status,
        created_at=record.created_at,
    )


# ─── Admin export ──────────────────────────────────────────────────────
#
# Single CSV-streaming endpoint protected by the env-driven admin
# allowlist (see ``Settings.admin_user_ids``). Used by ops to ingest the
# feedback ledger into Excel / Google Sheets — the response is UTF-8
# with a BOM so Excel auto-detects the encoding for CJK content.

_CSV_COLUMNS = [
    "id",
    "created_at",
    "category",
    "display_name",
    "account_email",
    "contact_email",
    "body",
    "locale",
    "app_version",
    "status",
]


async def _stream_feedback_csv(db) -> AsyncIterator[bytes]:  # type: ignore[no-untyped-def]
    # UTF-8 BOM up front so Excel renders Traditional Chinese without
    # the user picking an encoding manually.
    yield "﻿".encode()

    header_buf = io.StringIO()
    csv.writer(header_buf).writerow(_CSV_COLUMNS)
    yield header_buf.getvalue().encode()

    stmt = (
        select(FeedbackSubmissionORM)
        .options(selectinload(FeedbackSubmissionORM.user))
        .order_by(FeedbackSubmissionORM.created_at.desc())
    )
    result = await db.stream(stmt)
    async for row in result.scalars():
        user = row.user
        buf = io.StringIO()
        csv.writer(buf).writerow(
            [
                row.id,
                row.created_at.isoformat(),
                row.category,
                user.display_name if user else "",
                user.email if user else "",
                row.contact_email or "",
                row.body,
                row.locale,
                row.app_version or "",
                row.status,
            ]
        )
        yield buf.getvalue().encode()


@router.get("/export.csv")
async def export_feedback_csv(
    _admin_user_id: AdminUserId,
    db: DbDep,
) -> StreamingResponse:
    """Stream the full feedback ledger as UTF-8 CSV with BOM.

    Wide-open to the admin allowlist intentionally: this is an internal
    ops surface, not a public API. We don't paginate — at the
    submissions-per-hour rate limits and typical retention, the table
    stays small enough to dump in one go. If it grows past O(MB), swap
    to a date-range query.
    """
    return StreamingResponse(
        _stream_feedback_csv(db),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                'attachment; filename="focustown-feedback.csv"'
            )
        },
    )
