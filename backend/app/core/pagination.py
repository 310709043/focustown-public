"""Cursor codec + SQL keyset filter, infra-free.

Lives in ``app/core/`` rather than ``app/api/v1/_common/`` because the
SQL repositories under ``app/infrastructure/`` need ``apply_keyset`` —
and importing ``app.api.v1`` from infrastructure would cycle through
``app/api/v1/__init__.py`` (which imports every feature router, which
imports the repositories).

The router-side envelope (``Page[T]``, ``build_page``) lives in
``app/api/v1/_common/pagination.py`` and re-exports from here so feature
routers can keep using the single ``from app.api.v1._common.pagination``
import.
"""
from __future__ import annotations

import json
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime
from typing import Any

from app.core.exceptions import ValidationError


class InvalidCursorError(ValidationError):
    """Raised when a client-supplied cursor can't be decoded.

    Subclasses ``ValidationError`` so the project-wide exception handler
    translates it into the standard 422 envelope without each router
    having to catch and re-raise.
    """

    code = "invalid_cursor"


def encode_cursor(created_at: datetime, id_: str) -> str:
    payload = json.dumps(
        {"ts": created_at.isoformat(), "id": id_}, separators=(",", ":")
    )
    return urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        pad = "=" * (-len(cursor) % 4)
        raw = urlsafe_b64decode((cursor + pad).encode("ascii"))
        payload = json.loads(raw)
        ts = datetime.fromisoformat(payload["ts"])
        id_ = str(payload["id"])
    except (ValueError, KeyError, TypeError) as exc:
        raise InvalidCursorError("invalid_cursor") from exc
    return ts, id_


def apply_keyset(
    stmt: Any,
    *,
    ts_col: Any,
    id_col: Any,
    cursor: str | None,
) -> Any:
    """Append a strict ``(ts_col, id_col) < (cursor_ts, cursor_id)`` filter
    to ``stmt`` when a cursor is supplied.

    Several drivers fall back to row-by-row evaluation for SQLAlchemy's
    tuple-comparison helper; the explicit boolean form below planner-walks
    consistently on Postgres and SQLite. Always pair with
    ``order_by(ts_col.desc(), id_col.desc())`` so the keyset and the
    ORDER BY agree.
    """
    from sqlalchemy import and_, or_

    if cursor is None:
        return stmt
    ts, last_id = decode_cursor(cursor)
    return stmt.where(
        or_(
            ts_col < ts,
            and_(ts_col == ts, id_col < last_id),
        )
    )
