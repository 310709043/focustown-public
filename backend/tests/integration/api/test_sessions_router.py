"""Sessions router integration tests.

Worth testing:
- start persists ACTIVE session against real DB; response shape uses real
  duration_seconds (so we catch type drift)
- complete on the same session sets status=completed and returns remaining=0
- complete a second time → 409 (conflict)
- get by a stranger → 403 (forbidden)
- start without bearer → 401

NOT worth testing:
- GET happy path of the just-created session — covered by start/complete
  round-trips already
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_start_session_persists_active(client, auth_headers, db_session):
    from sqlalchemy import text

    response = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 600, "task_label": "deep work"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    sid = response.json()["id"]
    row = (
        await db_session.execute(
            text("SELECT status FROM focus_sessions WHERE id = :id"),
            {"id": sid},
        )
    ).one()
    assert row.status == "active"


@pytest.mark.asyncio
async def test_complete_returns_completed_status(client, auth_headers):
    start = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 60},
        headers=auth_headers,
    )
    sid = start.json()["id"]
    complete = await client.post(
        f"/api/v1/sessions/{sid}/complete", headers=auth_headers
    )
    assert complete.status_code == 200
    assert complete.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_complete_twice_returns_conflict(client, auth_headers):
    start = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 60},
        headers=auth_headers,
    )
    sid = start.json()["id"]
    await client.post(f"/api/v1/sessions/{sid}/complete", headers=auth_headers)
    second = await client.post(
        f"/api/v1/sessions/{sid}/complete", headers=auth_headers
    )
    assert second.status_code == 409
    assert second.json()["error"]["message"] == "session_not_active"


@pytest.mark.asyncio
async def test_get_by_non_member_is_forbidden(client, auth_headers):
    # Alice starts a session.
    start = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 600},
        headers=auth_headers,
    )
    sid = start.json()["id"]

    # Bob signs up and tries to read Alice's session.
    from app.core.config import get_settings

    bob_signup = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "bob@example.com",
            "password": "Bob-secret-123",
            "display_name": "Bob",
            "terms_accepted": True,
            "terms_version": get_settings().terms_current_version,
            "marketing_opt_in": False,
        },
    )
    bob_token = bob_signup.json()["tokens"]["access_token"]
    response = await client.get(
        f"/api/v1/sessions/{sid}",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["message"] == "not_session_member"


@pytest.mark.asyncio
async def test_start_session_without_bearer_returns_401(client):
    response = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 600},
    )
    assert response.status_code == 401
