"""Unit tests for ``FeedbackService``.

Covers: category validation, body sanitisation, context trimming.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.clock import IClock
from app.core.exceptions import ValidationError
from app.core.ids import IIdGenerator
from app.domain.repositories.feedback_repo import FeedbackRecord, IFeedbackRepo
from app.domain.services.feedback_service import (
    MAX_CONTEXT_KEYS,
    FeedbackService,
)


class _FakeIds(IIdGenerator):
    def __init__(self) -> None:
        self._n = 0

    def new_id(self) -> str:
        self._n += 1
        return f"id-{self._n}"


class _FakeClock(IClock):
    def now(self) -> datetime:  # type: ignore[override]
        return datetime(2026, 5, 19, 12, 0, tzinfo=UTC)


class _FakeFeedbackRepo(IFeedbackRepo):
    def __init__(self) -> None:
        self.rows: list[FeedbackRecord] = []

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
    ) -> FeedbackRecord:
        rec = FeedbackRecord(
            id=feedback_id,
            user_id=user_id,
            category=category,
            body=body,
            contact_email=contact_email,
            status="new",
            locale=locale,
            app_version=app_version,
            context=context,
            created_at=datetime(2026, 5, 19, 12, 0, tzinfo=UTC),
        )
        self.rows.append(rec)
        return rec


def _service() -> tuple[FeedbackService, _FakeFeedbackRepo]:
    repo = _FakeFeedbackRepo()
    svc = FeedbackService(feedback=repo, ids=_FakeIds(), clock=_FakeClock())
    return svc, repo


@pytest.mark.asyncio
async def test_submit_happy_path_persists_normalised_row() -> None:
    svc, repo = _service()
    rec = await svc.submit(
        user_id="user-1",
        category="Bug",  # case-insensitive
        body="  the app crashes on focus start  ",
        contact_email="me@example.com",
        locale="en",
        app_version="1.0.0",
        context={"url": "/town", "user_agent": "ua-string"},
    )
    assert rec.category == "bug"
    assert rec.body == "the app crashes on focus start"
    assert rec.contact_email == "me@example.com"
    assert rec.locale == "en"
    assert rec.context == {"url": "/town", "user_agent": "ua-string"}
    assert len(repo.rows) == 1


@pytest.mark.asyncio
async def test_submit_rejects_unknown_category() -> None:
    svc, _ = _service()
    with pytest.raises(ValidationError):
        await svc.submit(
            user_id=None,
            category="rant",
            body="anything",
            contact_email=None,
            locale="zh-TW",
            app_version=None,
            context=None,
        )


@pytest.mark.asyncio
async def test_submit_rejects_empty_body() -> None:
    svc, _ = _service()
    with pytest.raises(ValidationError):
        await svc.submit(
            user_id="user-1",
            category="suggestion",
            body="   ",
            contact_email=None,
            locale="en",
            app_version=None,
            context=None,
        )


@pytest.mark.asyncio
async def test_submit_strips_non_scalar_context_values() -> None:
    svc, repo = _service()
    raw_context = {
        "url": "/profile",
        "deep": {"nested": "object"},  # dropped
        "list": [1, 2, 3],  # dropped
        "flag": True,
        "count": 7,
    }
    await svc.submit(
        user_id="user-1",
        category="suggestion",
        body="x",
        contact_email=None,
        locale="en",
        app_version=None,
        context=raw_context,
    )
    persisted = repo.rows[0].context
    assert persisted == {"url": "/profile", "flag": True, "count": 7}


@pytest.mark.asyncio
async def test_submit_truncates_context_to_max_keys() -> None:
    svc, repo = _service()
    raw = {f"k{i}": f"v{i}" for i in range(MAX_CONTEXT_KEYS + 5)}
    await svc.submit(
        user_id="user-1",
        category="other",
        body="x",
        contact_email=None,
        locale="en",
        app_version=None,
        context=raw,
    )
    assert len(repo.rows[0].context or {}) == MAX_CONTEXT_KEYS


@pytest.mark.asyncio
async def test_submit_accepts_anonymous_user() -> None:
    svc, repo = _service()
    rec = await svc.submit(
        user_id=None,
        category="praise",
        body="love this",
        contact_email=None,
        locale="en",
        app_version=None,
        context=None,
    )
    assert rec.user_id is None
    assert repo.rows[0].user_id is None
