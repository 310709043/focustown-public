from __future__ import annotations

import re
import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger

log = get_logger(__name__)

_HEADER = "X-Request-ID"
# Trace ids must be short + URL-safe so they fit cleanly in CloudWatch /
# Datadog tag filters and don't bloat every log line. Anything else from a
# client is replaced with a fresh uuid — defends against header-injection of
# control chars, multi-KB blobs, or JSON-renderer-mangling punctuation.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def _coerce_request_id(raw: str | None) -> str:
    """Pass through a client-supplied request id when valid, else mint one.

    A whitespace-only header is treated as missing — sending blanks shouldn't
    let a caller anonymise their requests on our side. Out-of-charset or
    over-length values are silently replaced (we don't 400 a request just
    because tracing metadata was malformed).
    """
    if raw is None:
        return uuid.uuid4().hex
    candidate = raw.strip()
    if not _REQUEST_ID_RE.match(candidate):
        return uuid.uuid4().hex
    return candidate


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Bind a per-request id to structlog contextvars + echo it in the response.

    Every log line emitted inside the request — by routers, services, or
    third-party libs that use the configured structlog instance — picks up
    the `request_id`, `route`, `method`, and (once `get_current_user_id`
    runs) `user_id` via `merge_contextvars`. The middleware also emits one
    canonical `request_completed` line at the tail with timing + status.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        structlog.contextvars.clear_contextvars()
        request_id = _coerce_request_id(request.headers.get(_HEADER))
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            route=request.url.path,
            method=request.method,
        )
        start = time.perf_counter()
        try:
            try:
                response = await call_next(request)
            except Exception:
                latency_ms = round((time.perf_counter() - start) * 1000, 2)
                log.exception("request_failed", latency_ms=latency_ms)
                raise
            response.headers[_HEADER] = request_id
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            log.info(
                "request_completed",
                status=response.status_code,
                latency_ms=latency_ms,
            )
            return response
        finally:
            structlog.contextvars.clear_contextvars()
