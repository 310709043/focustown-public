from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.core.clock import IClock
from app.core.exceptions import ValidationError
from app.core.ids import IIdGenerator
from app.domain.repositories.feedback_repo import FeedbackRecord, IFeedbackRepo

ALLOWED_CATEGORIES: frozenset[str] = frozenset({"bug", "suggestion", "praise", "other"})

MAX_BODY_LEN = 4_000
MAX_CONTEXT_KEYS = 16


class FeedbackService:
    """Application service for user-submitted feedback.

    SOLID notes:
      • SRP — only handles validation + persistence of feedback rows.
        Email / Slack / Linear fan-out belongs in a subscriber, not here.
      • DIP — depends on `IFeedbackRepo` Protocol (not the SQL adapter)
        and on `IIdGenerator` / `IClock` for testability.
      • OCP — adding a new category is a one-line frozenset edit; adding
        a new notifier is a new subscriber to a future FeedbackSubmitted
        event without touching this service.
    """

    def __init__(
        self,
        *,
        feedback: IFeedbackRepo,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._feedback = feedback
        self._ids = ids
        self._clock = clock

    async def submit(
        self,
        *,
        user_id: str | None,
        category: str,
        body: str,
        contact_email: str | None,
        locale: str,
        app_version: str | None,
        context: dict[str, Any] | None,
    ) -> FeedbackRecord:
        category = (category or "").strip().lower()
        if category not in ALLOWED_CATEGORIES:
            raise ValidationError("invalid_category")

        body = (body or "").strip()
        if not body:
            raise ValidationError("body_required")
        if len(body) > MAX_BODY_LEN:
            raise ValidationError("body_too_long")

        cleaned_context = _sanitise_context(context)

        return await self._feedback.create(
            feedback_id=self._ids.new_id(),
            user_id=user_id,
            category=category,
            body=body,
            contact_email=(contact_email or "").strip() or None,
            locale=locale,
            app_version=app_version,
            context=cleaned_context,
        )


def _sanitise_context(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip out values that aren't simple scalars / short strings to keep
    the JSONB column small and predictable. We never query inside this
    blob, but defensive trimming avoids accidental log bloat."""
    if not raw:
        return None
    allowed_pairs: Iterable[tuple[str, Any]] = (
        (str(k)[:64], _coerce_scalar(v)) for k, v in raw.items()
    )
    trimmed = {k: v for k, v in allowed_pairs if v is not None}
    if not trimmed:
        return None
    if len(trimmed) > MAX_CONTEXT_KEYS:
        trimmed = dict(list(trimmed.items())[:MAX_CONTEXT_KEYS])
    return trimmed


def _coerce_scalar(v: Any) -> Any:
    if isinstance(v, str):
        return v[:512]
    if isinstance(v, (bool, int, float)):
        return v
    return None
