"""Codec + Page wrapping unit tests for the Phase 02 pagination helper."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.api.v1._common.pagination import (
    InvalidCursorError,
    Page,
    build_page,
    decode_cursor,
    encode_cursor,
)


def test_encode_decode_round_trip_basic() -> None:
    ts = datetime(2026, 5, 22, 12, 34, 56, tzinfo=UTC)
    cursor = encode_cursor(ts, "abc-123")
    decoded_ts, decoded_id = decode_cursor(cursor)
    assert decoded_ts == ts
    assert decoded_id == "abc-123"


def test_encode_decode_round_trip_preserves_microseconds() -> None:
    ts = datetime(2026, 5, 22, 12, 34, 56, 789123, tzinfo=UTC)
    cursor = encode_cursor(ts, "550e8400-e29b-41d4-a716-446655440000")
    decoded_ts, decoded_id = decode_cursor(cursor)
    assert decoded_ts == ts
    assert decoded_id == "550e8400-e29b-41d4-a716-446655440000"


def test_cursor_is_url_safe_no_padding_no_slashes_no_plus() -> None:
    # Hammer the encoding with payloads guaranteed to produce ``=``,
    # ``+``, or ``/`` under stdlib b64encode. urlsafe + rstrip should
    # leave us with [A-Za-z0-9_-] only.
    for ts in [
        datetime(2026, 1, 1, tzinfo=UTC),
        datetime(2026, 5, 22, 23, 59, 59, 999999, tzinfo=UTC),
        datetime(1970, 1, 1, tzinfo=UTC),
    ]:
        cursor = encode_cursor(ts, "x" * 36)
        assert "=" not in cursor
        assert "+" not in cursor
        assert "/" not in cursor


def test_decode_invalid_cursor_raises() -> None:
    with pytest.raises(InvalidCursorError):
        decode_cursor("not-base64!!!")


def test_decode_well_formed_b64_but_garbage_json_raises() -> None:
    # base64 of "hello" — valid bytes but not JSON
    import base64

    raw = base64.urlsafe_b64encode(b"hello").decode().rstrip("=")
    with pytest.raises(InvalidCursorError):
        decode_cursor(raw)


def test_decode_missing_key_raises() -> None:
    import base64

    raw = base64.urlsafe_b64encode(b'{"ts":"2026-05-22T00:00:00+00:00"}').decode().rstrip("=")
    with pytest.raises(InvalidCursorError):
        decode_cursor(raw)


class _Row:
    def __init__(self, id_: str, created_at: datetime, value: str) -> None:
        self.id = id_
        self.created_at = created_at
        self.value = value


def _key(r: _Row) -> tuple[datetime, str]:
    return r.created_at, r.id


def _to_dict(r: _Row) -> dict[str, Any]:
    return {"id": r.id, "value": r.value}


def test_build_page_under_limit_yields_null_cursor() -> None:
    ts = datetime(2026, 5, 22, tzinfo=UTC)
    rows = [_Row(f"id-{i}", ts, f"v{i}") for i in range(3)]
    page = build_page(rows, limit=10, key=_key, to_item=_to_dict)
    assert isinstance(page, Page)
    assert page.next_cursor is None
    assert page.items == [{"id": f"id-{i}", "value": f"v{i}"} for i in range(3)]


def test_build_page_exactly_limit_yields_null_cursor() -> None:
    ts = datetime(2026, 5, 22, tzinfo=UTC)
    rows = [_Row(f"id-{i}", ts, f"v{i}") for i in range(5)]
    page = build_page(rows, limit=5, key=_key, to_item=_to_dict)
    # Repos overfetch by 1 — if we have exactly `limit` rows there is
    # no overflow row, so no next page exists.
    assert page.next_cursor is None
    assert len(page.items) == 5


def test_build_page_overflow_yields_cursor_from_last_kept_row() -> None:
    rows = [
        _Row(f"id-{i}", datetime(2026, 5, 22, 0, 0, i, tzinfo=UTC), f"v{i}")
        for i in range(6)
    ]
    page = build_page(rows, limit=5, key=_key, to_item=_to_dict)
    # 5 items returned, cursor points at the 5th (index 4) — i.e. the
    # last row IN the page, not the overflow row past it.
    assert len(page.items) == 5
    assert page.next_cursor is not None
    decoded_ts, decoded_id = decode_cursor(page.next_cursor)
    assert decoded_id == "id-4"
    assert decoded_ts == datetime(2026, 5, 22, 0, 0, 4, tzinfo=UTC)


def test_build_page_empty_input() -> None:
    page = build_page([], limit=10, key=_key, to_item=_to_dict)
    assert page.items == []
    assert page.next_cursor is None
