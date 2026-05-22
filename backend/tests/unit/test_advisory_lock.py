"""Unit tests for the advisory-lock helpers.

These tests don't touch a real Postgres — they pin behaviour we care
about *before* any DB call:

- ``advisory_xact_lock`` issues exactly ``SELECT pg_advisory_xact_lock(:k)``
  with the caller's key.
- ``hash_match_id`` is stable (same input → same int across calls — i.e.
  not process-salted like ``hash()``) and stays inside ``bigint``.

Integration coverage of the lock actually serialising parallel callers
lives in ``tests/integration/test_match_accept_lock.py``.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from sqlalchemy.sql.elements import TextClause

from app.infrastructure.db.locks import advisory_xact_lock, hash_match_id

_INT64_MAX = (1 << 63) - 1
_INT64_MIN = -(1 << 63)


@pytest.mark.asyncio
async def test_advisory_xact_lock_emits_expected_sql() -> None:
    session = AsyncMock()
    key = 12345

    await advisory_xact_lock(session, key)

    session.execute.assert_awaited_once()
    args, _ = session.execute.call_args
    stmt, params = args
    assert isinstance(stmt, TextClause)
    assert "pg_advisory_xact_lock(:k)" in str(stmt)
    assert params == {"k": key}


def test_hash_match_id_is_stable_across_calls() -> None:
    a = hash_match_id("match-abc")
    b = hash_match_id("match-abc")
    assert a == b


def test_hash_match_id_differs_for_different_inputs() -> None:
    assert hash_match_id("match-a") != hash_match_id("match-b")


def test_hash_match_id_fits_in_signed_int64() -> None:
    for sample in ["", "x", "a" * 1024, "match-12345"]:
        v = hash_match_id(sample)
        assert _INT64_MIN <= v <= _INT64_MAX


def test_hash_match_id_accepts_uuid_and_matches_string() -> None:
    from uuid import UUID

    uid = UUID("00000000-0000-0000-0000-0000000000ff")
    assert hash_match_id(uid) == hash_match_id(str(uid))
