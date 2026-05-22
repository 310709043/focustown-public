"""POST /sessions idempotency dedup integration test.

What this test pins:
- Same Idempotency-Key + same body → one row, same session id returned
  on the second call.
- Same Idempotency-Key + different body → 409 ``idempotency_conflict``
  on the second call (refuse to silently return a row that doesn't
  match the new request).
- Different Idempotency-Key → two rows.
- No Idempotency-Key → two rows (caller opted out of dedup).

The literal "two parallel POSTs from gather" race is exercised at the
repo level via the partial unique index and IntegrityError → domain
exception translation; sequentially testing the contract here is enough
because the test fixture wires both calls through a single shared
``AsyncSession`` (SQLAlchemy serialises operations on one connection,
so ``gather`` doesn't actually run them in parallel against the DB).
"""
from __future__ import annotations

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


async def _count_sessions(db_session, user_id: str) -> int:
    row = (
        await db_session.execute(
            text(
                "SELECT COUNT(*) FROM focus_sessions WHERE user_id = :uid"
            ),
            {"uid": user_id},
        )
    ).one()
    return int(row[0])


async def test_same_key_same_body_returns_existing_row(
    client, auth_headers, authed_user, db_session
):
    body = {"mode": "focus", "duration_seconds": 600, "task_label": "deep work"}
    headers = {**auth_headers, "Idempotency-Key": "abc-123"}

    first = await client.post("/api/v1/sessions", json=body, headers=headers)
    second = await client.post("/api/v1/sessions", json=body, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert await _count_sessions(db_session, authed_user["id"]) == 1


async def test_same_key_different_body_returns_idempotency_conflict(
    client, auth_headers, authed_user, db_session
):
    body_a = {"mode": "focus", "duration_seconds": 600}
    body_b = {"mode": "focus", "duration_seconds": 900}  # different duration
    headers = {**auth_headers, "Idempotency-Key": "abc-456"}

    first = await client.post("/api/v1/sessions", json=body_a, headers=headers)
    second = await client.post("/api/v1/sessions", json=body_b, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "idempotency_conflict"
    assert await _count_sessions(db_session, authed_user["id"]) == 1


async def test_different_keys_create_separate_rows(
    client, auth_headers, authed_user, db_session
):
    body = {"mode": "focus", "duration_seconds": 600}
    first = await client.post(
        "/api/v1/sessions",
        json=body,
        headers={**auth_headers, "Idempotency-Key": "key-A"},
    )
    second = await client.post(
        "/api/v1/sessions",
        json=body,
        headers={**auth_headers, "Idempotency-Key": "key-B"},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert await _count_sessions(db_session, authed_user["id"]) == 2


async def test_no_idempotency_key_creates_separate_rows(
    client, auth_headers, authed_user, db_session
):
    body = {"mode": "focus", "duration_seconds": 600}
    first = await client.post("/api/v1/sessions", json=body, headers=auth_headers)
    second = await client.post("/api/v1/sessions", json=body, headers=auth_headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert await _count_sessions(db_session, authed_user["id"]) == 2
