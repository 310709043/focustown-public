"""LowBatteryTown feedback box ("意見箱").

Same rules as ``edge/src/feedback.ts``: anonymous unless an e-mail is left,
a honeypot field for bots, stored first, then copied to the owner's Google
Sheet as a convenience.
"""
from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

from app.core.clock import IClock
from app.core.ids import IIdGenerator
from app.domain.repositories.lbt import IFeedbackSheet, ILbtFeedbackRepo, LbtFeedbackRecord
from app.domain.services.lbt_rules import LbtInputError, clean_text

FEEDBACK_MAX = 1000
FEEDBACK_EMAIL_MAX = 254
FEEDBACK_PAGE_MAX = 200
FEEDBACK_CATEGORIES = ("idea", "bug", "other")
FEEDBACK_STATUSES = ("new", "read", "done")
FEEDBACK_LOCALES = ("zh-TW", "en")

# Deliberately loose: one @, a dot in the domain, no spaces.
_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_FORMULA = re.compile(r"^[=+\-@\t\r]")


@dataclass(frozen=True, slots=True)
class FeedbackInput:
    category: str
    message: str
    email: str | None
    page: str | None
    locale: str | None


def parse_feedback(raw: Mapping[str, object] | None) -> FeedbackInput | None:
    """Validate a submission; ``None`` means the honeypot was filled (drop it
    silently). Raises ``LbtInputError`` with the same codes as the Worker."""
    body = raw or {}
    website = body.get("website")
    if isinstance(website, str) and website.strip():
        return None

    category = body.get("category")
    if not isinstance(category, str) or category not in FEEDBACK_CATEGORIES:
        raise LbtInputError("invalid_category")
    raw_message = body.get("message")
    if not isinstance(raw_message, str) or len(raw_message.strip()) > FEEDBACK_MAX:
        raise LbtInputError("invalid_message")
    message = clean_text(raw_message, limit=FEEDBACK_MAX)
    if not message:
        raise LbtInputError("invalid_message")

    email: str | None = None
    raw_email = body.get("email")
    if raw_email not in (None, ""):
        value = raw_email.strip() if isinstance(raw_email, str) else ""
        if len(value) > FEEDBACK_EMAIL_MAX or not _EMAIL.match(value):
            raise LbtInputError("invalid_email")
        email = value

    page_raw = clean_text(body.get("page"), limit=FEEDBACK_PAGE_MAX)
    page = page_raw if page_raw.startswith("/") else None
    locale_raw = body.get("locale")
    locale = locale_raw if isinstance(locale_raw, str) and locale_raw in FEEDBACK_LOCALES else None
    return FeedbackInput(category=category, message=message, email=email, page=page, locale=locale)


def sheet_safe(value: str | None) -> str:
    """Stop a spreadsheet from treating user text as a formula."""
    if not value:
        return ""
    return f"'{value}" if _FORMULA.match(value) else value


class LbtFeedbackService:
    def __init__(
        self,
        *,
        repo: ILbtFeedbackRepo,
        clock: IClock,
        ids: IIdGenerator,
        sheet: IFeedbackSheet | None = None,
    ) -> None:
        self._repo = repo
        self._clock = clock
        self._ids = ids
        self._sheet = sheet

    async def submit(self, raw: Mapping[str, object] | None) -> str:
        """Store one entry and copy it to the sheet. Returns its id (a fresh,
        unstored id for honeypot hits, so bots see a normal answer)."""
        parsed = parse_feedback(raw)
        if parsed is None:
            return self._ids.new_id()
        record = LbtFeedbackRecord(
            id=self._ids.new_id(),
            category=parsed.category,
            message=parsed.message,
            email=parsed.email,
            page=parsed.page,
            locale=parsed.locale,
            status="new",
            created_at=self._clock.now(),
        )
        await self._repo.create(record)
        if self._sheet is not None and await self._sheet.append(record):
            await self._repo.mark_sheet_sent(record.id)
        return record.id
