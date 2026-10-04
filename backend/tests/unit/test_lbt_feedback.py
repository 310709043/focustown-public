"""LowBatteryTown feedback box: input rules (same codes as the Worker), the
honeypot, formula-safe sheet values, storing before the sheet copy, and the
sheet never being able to lose an entry."""
from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.services.lbt_feedback import (
    FEEDBACK_MAX,
    LbtFeedbackService,
    parse_feedback,
    sheet_safe,
)
from app.domain.services.lbt_rules import LbtInputError
from tests.unit.fakes import FakeClock, FakeIdGen
from tests.unit.lbt_fakes import InMemoryLbtFeedbackRepo, RecordingFeedbackSheet

T0 = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)


def _code(raw: dict[str, object]) -> str:
    with pytest.raises(LbtInputError) as exc:
        parse_feedback(raw)
    return exc.value.code


# ── parse_feedback ────────────────────────────────────────────────────


def test_accepts_minimal_submission_and_cleans_text() -> None:
    parsed = parse_feedback({"category": "idea", "message": "  多一點夜景‮  "})
    assert parsed is not None
    assert (parsed.category, parsed.message, parsed.email, parsed.page, parsed.locale) == (
        "idea",
        "多一點夜景",
        None,
        None,
        None,
    )


def test_keeps_valid_email_page_and_locale() -> None:
    parsed = parse_feedback(
        {
            "category": "bug",
            "message": "x",
            "email": " a@b.co ",
            "page": "/zh-TW",
            "locale": "zh-TW",
        }
    )
    assert parsed is not None
    assert (parsed.email, parsed.page, parsed.locale) == ("a@b.co", "/zh-TW", "zh-TW")


def test_drops_non_path_page_and_unknown_locale() -> None:
    parsed = parse_feedback(
        {"category": "other", "message": "x", "page": "https://evil", "locale": "fr"}
    )
    assert parsed is not None
    assert (parsed.page, parsed.locale) == (None, None)


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        ({"category": "rant", "message": "x"}, "invalid_category"),
        ({"message": "x"}, "invalid_category"),
        ({"category": "idea", "message": "   "}, "invalid_message"),
        ({"category": "idea", "message": "x" * (FEEDBACK_MAX + 1)}, "invalid_message"),
        ({"category": "idea", "message": 42}, "invalid_message"),
        ({"category": "idea", "message": "x", "email": "not-an-email"}, "invalid_email"),
        ({"category": "idea", "message": "x", "email": 7}, "invalid_email"),
    ],
)
def test_rejects_bad_input_with_worker_codes(raw: dict[str, object], code: str) -> None:
    assert _code(raw) == code


def test_honeypot_returns_none() -> None:
    assert parse_feedback({"category": "idea", "message": "x", "website": "spam.example"}) is None


def test_none_body_is_invalid_category() -> None:
    with pytest.raises(LbtInputError):
        parse_feedback(None)


# ── sheet_safe ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("=1+1", "'=1+1"),
        ("+1", "'+1"),
        ("-1", "'-1"),
        ("@a", "'@a"),
        ("hello", "hello"),
        (None, ""),
    ],
)
def test_sheet_safe_neutralises_formulas(value: str | None, expected: str) -> None:
    assert sheet_safe(value) == expected


# ── LbtFeedbackService ────────────────────────────────────────────────


@pytest.fixture
def repo() -> InMemoryLbtFeedbackRepo:
    return InMemoryLbtFeedbackRepo()


def _service(repo: InMemoryLbtFeedbackRepo, sheet: RecordingFeedbackSheet | None = None):
    return LbtFeedbackService(repo=repo, clock=FakeClock(current=T0), ids=FakeIdGen(), sheet=sheet)


async def test_submit_stores_entry_as_new(repo: InMemoryLbtFeedbackRepo) -> None:
    feedback_id = await _service(repo).submit({"category": "idea", "message": "想要下雨的夜景"})
    row = repo.rows[feedback_id]
    assert (row.status, row.message, row.created_at) == ("new", "想要下雨的夜景", T0)
    assert row.sheet_sent is False


async def test_submit_copies_to_sheet_and_marks_sent(repo: InMemoryLbtFeedbackRepo) -> None:
    sheet = RecordingFeedbackSheet()
    feedback_id = await _service(repo, sheet).submit({"category": "bug", "message": "按鈕沒反應"})
    assert [r.id for r in sheet.sent] == [feedback_id]
    assert repo.rows[feedback_id].sheet_sent is True


async def test_refused_sheet_keeps_the_entry_unsent(repo: InMemoryLbtFeedbackRepo) -> None:
    sheet = RecordingFeedbackSheet(accept=False)
    feedback_id = await _service(repo, sheet).submit({"category": "other", "message": "x"})
    assert repo.rows[feedback_id].sheet_sent is False


async def test_honeypot_stores_nothing_but_returns_an_id(repo: InMemoryLbtFeedbackRepo) -> None:
    sheet = RecordingFeedbackSheet()
    feedback_id = await _service(repo, sheet).submit(
        {"category": "idea", "message": "buy now", "website": "x"}
    )
    assert feedback_id
    assert repo.rows == {}
    assert sheet.sent == []


async def test_invalid_input_stores_nothing(repo: InMemoryLbtFeedbackRepo) -> None:
    with pytest.raises(LbtInputError):
        await _service(repo).submit({"category": "idea", "message": ""})
    assert repo.rows == {}


async def test_repo_purges_entries_past_cutoff(repo: InMemoryLbtFeedbackRepo) -> None:
    service = _service(repo)
    kept = await service.submit({"category": "idea", "message": "x"})
    repo.rows["old"] = replace(repo.rows[kept], id="old", created_at=T0 - timedelta(days=400))
    assert await repo.delete_older_than(T0 - timedelta(days=365)) == 1
    assert list(repo.rows) == [kept]
