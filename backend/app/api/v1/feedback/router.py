from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.v1.feedback.schemas import (
    FeedbackSubmitRequest,
    FeedbackSubmitResponse,
)
from app.core.deps import (
    ClockDep,
    CurrentUserIdOptional,
    DbDep,
    IdGenDep,
    RateLimiterDep,
)
from app.core.exceptions import RateLimitedError
from app.domain.services.feedback_service import FeedbackService
from app.infrastructure.db.repositories import SqlFeedbackRepo

# Rate-limit feedback submissions: a signed-in user can post 5 / hour;
# anonymous traffic is throttled to 10 / hour per IP. Tight enough to
# block scripted spam, loose enough that real users can iterate.
USER_LIMIT = 5
USER_WINDOW_SECONDS = 60 * 60
IP_LIMIT = 10
IP_WINDOW_SECONDS = 60 * 60

router = APIRouter()


def _service(db, ids, clock) -> FeedbackService:  # type: ignore[no-untyped-def]
    return FeedbackService(
        feedback=SqlFeedbackRepo(db),
        ids=ids,
        clock=clock,
    )


@router.post("", response_model=FeedbackSubmitResponse, status_code=201)
async def submit_feedback(
    payload: FeedbackSubmitRequest,
    request: Request,
    user_id: CurrentUserIdOptional,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    limiter: RateLimiterDep,
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
    return FeedbackSubmitResponse(
        id=record.id,
        status=record.status,
        created_at=record.created_at,
    )
