from __future__ import annotations


class FocusTownError(Exception):
    """Base domain exception."""

    status_code: int = 400
    code: str = "focustown_error"


class NotFoundError(FocusTownError):
    status_code = 404
    code = "not_found"


class ConflictError(FocusTownError):
    status_code = 409
    code = "conflict"


class AuthError(FocusTownError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(FocusTownError):
    status_code = 403
    code = "forbidden"


class ValidationError(FocusTownError):
    status_code = 422
    code = "validation_error"


class RateLimitedError(FocusTownError):
    status_code = 429
    code = "rate_limited"


class InsufficientFundsError(FocusTownError):
    status_code = 402
    code = "insufficient_funds"


class BusinessError(FocusTownError):
    status_code = 400
    code = "business_error"


class InternalError(FocusTownError):
    """Catch-all for unhandled exceptions that escape domain code.

    Raised only by the global Exception handler in ``app/main.py``; never
    raised by services or routers directly (use a more specific subclass).
    Exists so the response envelope stays uniform when something explodes
    unexpectedly — never put ``str(e)`` in the message.
    """

    status_code = 500
    code = "internal_error"


class IdempotencyViolationError(FocusTownError):
    """A previously-recorded (ref_type, ref_id) was retried.

    Raised by repositories when a unique index for idempotency keys trips.
    Services decide whether to translate this into ``ConflictError`` (user
    action — e.g. double-purchase) or to swallow it as a silent retry
    (event-driven award).
    """

    status_code = 409
    code = "idempotency_violation"
