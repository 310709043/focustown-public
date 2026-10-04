"""Copies LowBatteryTown feedback to the owner's Google Sheet through the
Apps Script web app in ``edge/scripts/feedback-sheet.gs``."""
from __future__ import annotations

import httpx

from app.core.logging import get_logger
from app.domain.repositories.lbt import IFeedbackSheet, LbtFeedbackRecord
from app.domain.services.lbt_feedback import sheet_safe

log = get_logger(__name__)


class AppsScriptFeedbackSheet(IFeedbackSheet):
    def __init__(self, url: str, token: str, *, timeout: float = 5.0) -> None:
        self._url = url
        self._token = token
        self._timeout = timeout

    async def append(self, record: LbtFeedbackRecord) -> bool:
        # Apps Script can't read request headers, so the token goes in the body.
        payload = {
            "token": self._token,
            "id": record.id,
            "created_at": record.created_at.isoformat(),
            "category": record.category,
            "message": sheet_safe(record.message),
            "email": sheet_safe(record.email),
            "page": sheet_safe(record.page),
            "locale": record.locale or "",
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
                res = await client.post(self._url, json=payload)
            ok = res.is_success and res.json().get("ok") is True
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("lbt_feedback_sheet_failed", id=record.id, error=str(exc))
            return False
        if not ok:
            log.warning("lbt_feedback_sheet_failed", id=record.id, status=res.status_code)
        return ok
