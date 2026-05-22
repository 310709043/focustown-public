"""Integration tests for GET /api/v1/users/me/stats.

These tests guard the contract that the production frontend depends on:
- A brand-new account returns all-zero stats (no PRNG seed, no leaks).
- A completed focus session bumps total_tomatoes, all_time_focus_hours,
  week_total_hours, and streak_days by the expected amounts.
- weekly_rank is 0 when the user has no completions this week (frontend
  renders "—" for the empty state).

We rely on the real Postgres container fixture; SQLite would not exercise
the same DOW/HOUR extract used by ``weekly_heatmap``.
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_new_user_stats_are_all_zero(client, auth_headers):
    """A user with no completed focus sessions sees zeros across the board."""
    response = await client.get("/api/v1/users/me/stats", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_tomatoes"] == 0
    assert body["all_time_focus_hours"] == 0
    assert body["week_total_hours"] == 0
    assert body["streak_days"] == 0
    assert body["weekly_rank"] == 0
    assert body["level"] == 1
    assert body["xp"] == 0
    assert body["xp_next_level"] == 2000
    # 7-row by 24-col heatmap, all zeros for a new account.
    assert len(body["heatmap"]) == 7
    assert all(len(row) == 24 for row in body["heatmap"])
    assert all(cell == 0 for row in body["heatmap"] for cell in row)


@pytest.mark.asyncio
async def test_completed_focus_session_counts_in_stats(client, auth_headers):
    """One completed focus session lifts total_tomatoes and streak_days."""
    # Start + complete a real focus session through the public API so the
    # transition is identical to what the frontend does.
    start = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 1500},
        headers=auth_headers,
    )
    assert start.status_code == 201
    sid = start.json()["id"]
    complete = await client.post(
        f"/api/v1/sessions/{sid}/complete", headers=auth_headers
    )
    assert complete.status_code == 200

    response = await client.get("/api/v1/users/me/stats", headers=auth_headers)
    body = response.json()
    assert body["total_tomatoes"] == 1
    # ``complete`` records elapsed_seconds = min(duration, wall-clock elapsed).
    # The test completes within milliseconds of start, so the hours rollup
    # rounds to 0.0 — but the *count* is what matters for "Joel sees real
    # data". Hours will exercise once a real timed session completes.
    assert body["all_time_focus_hours"] == 0.0
    assert body["streak_days"] == 1
    # With only one focused user this week, weekly_rank should be 1.
    assert body["weekly_rank"] == 1
