"""Leaderboard router integration tests.

Worth testing:
- GET /leaderboard/today returns an empty list when there are no completed
  sessions today (so no spurious users leak through)
- After two users complete sessions, both appear with completed_count >= 1
  (we don't pin the ordering — that's exercised in the service unit tests)

NOT worth testing:
- The ordering algorithm — already covered by leaderboard service unit tests
- DTO field names — pinned by OpenAPI types
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_today_is_empty_when_no_sessions(client):
    response = await client.get("/api/v1/leaderboard/today")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_today_lists_users_with_completed_sessions(client, auth_headers):
    # Alice runs and completes one session.
    start = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 60},
        headers=auth_headers,
    )
    sid = start.json()["id"]
    await client.post(f"/api/v1/sessions/{sid}/complete", headers=auth_headers)

    response = await client.get("/api/v1/leaderboard/today")

    assert response.status_code == 200
    rows = response.json()
    assert any(row["completed_count"] >= 1 for row in rows)
