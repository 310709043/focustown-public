from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(slots=True)
class FeedbackRecord:
    id: str
    user_id: str | None
    category: str
    body: str
    contact_email: str | None
    status: str
    locale: str
    app_version: str | None
    context: dict[str, Any] | None
    created_at: datetime


class IFeedbackRepo(Protocol):
    """Append-only feedback repository.

    Why a Protocol: keeps `FeedbackService` framework-agnostic so it
    can be tested with an in-memory fake and so the concrete adapter
    (SQL today, eventually a queue or external tracker) can change
    without rewriting the domain logic.
    """

    async def create(
        self,
        *,
        feedback_id: str,
        user_id: str | None,
        category: str,
        body: str,
        contact_email: str | None,
        locale: str,
        app_version: str | None,
        context: dict[str, Any] | None,
    ) -> FeedbackRecord: ...
