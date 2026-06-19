from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings
from app.core.logging import get_logger
from app.domain.rate_limit import IRateLimiter

log = get_logger(__name__)

# Paths that bypass global rate limiting (health checks, internal probes).
_EXEMPT_PATHS: frozenset[str] = frozenset({"/healthz", "/ready"})


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP global rate limiter applied to every API request.

    Defence-in-depth: individual endpoints may have their own tighter limits
    (e.g. auth, shop purchase). This middleware catches broad abuse patterns
    — scrapers, credential stuffing, DDoS — before they reach route handlers.

    The limiter backend (Redis in prod, in-memory for tests) is injected so
    the middleware stays testable without a live Redis connection.
    """

    def __init__(
        self,
        app,  # type: ignore[no-untyped-def]
        *,
        limiter: IRateLimiter,
        settings: Settings,
    ) -> None:
        super().__init__(app)
        self._limiter = limiter
        self._limit = settings.global_rl_per_ip_per_min
        self._window = 60

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        # Skip health checks and non-API paths.
        path = request.url.path
        if path in _EXEMPT_PATHS or not path.startswith("/api/"):
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        key = f"global:ip:{client_ip}"

        decision = await self._limiter.hit(
            key, limit=self._limit, window_seconds=self._window
        )
        if not decision.allowed:
            log.warning(
                "global_rate_limited",
                ip=client_ip,
                path=path,
                retry_after=decision.retry_after_seconds,
            )
            return JSONResponse(
                status_code=423,
                content={
                    "error": {
                        "code": "rate_limited",
                        "message": "Too many requests. Please try again later.",
                    }
                },
                headers={"Retry-After": str(decision.retry_after_seconds)},
            )

        response = await call_next(request)
        # Expose rate-limit headers so well-behaved clients can back off.
        response.headers["X-RateLimit-Limit"] = str(self._limit)
        response.headers["X-RateLimit-Remaining"] = str(decision.remaining)
        return response

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, respecting X-Forwarded-For behind a trusted proxy."""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
