from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.observability.schemas import ClientErrorAck, ClientErrorReport
from app.core.deps import ClientIpDep, RateLimiterDep
from app.core.exceptions import RateLimitedError
from app.core.logging import get_logger

router = APIRouter()
log = get_logger(__name__)

_RATE_LIMIT_PER_MIN = 10
_WINDOW_SECONDS = 60


@router.post("/client-errors", response_model=ClientErrorAck, status_code=202)
async def report_client_error(
    payload: ClientErrorReport,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> ClientErrorAck:
    """Sink for frontend uncaught errors. Logs only — no DB row.

    Operators correlate via the `request_id` the browser captured from the
    failing API call's response header; cross-referencing it with backend
    logs reconstructs the full failure timeline.
    """
    key = f"client_errors:ip:{client_ip or 'unknown'}"
    decision = await limiter.hit(key, limit=_RATE_LIMIT_PER_MIN, window_seconds=_WINDOW_SECONDS)
    if not decision.allowed:
        raise RateLimitedError("rate_limited")

    log.warning(
        "client_error",
        message=payload.message,
        stack=payload.stack,
        client_request_id=payload.request_id,
        client_route=payload.route,
        client_ip=client_ip,
    )
    return ClientErrorAck()
