"""Integration tests for GET /api/v1/users/{user_id}/public.

The public profile is what the Citizen ID card on /users/[id] reads.
Previous behaviour only computed today_focus_minutes; the rest of
the card rendered "—" because the endpoint didn't return them. After
the 2026-05-24 wire-real-data pass it now mirrors the same focus_sessions
aggregates as /users/me/stats — proves to the viewer that no value is
synthesized.

These tests use the real Postgres container fixture; SQLite wouldn't
exercise the DOW/HOUR extracts inside the aggregation queries.
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_public_profile_for_new_user_is_all_zero_with_defaults(
    client, auth_headers, authed_user
):
    """A brand-new account exposes id + display name and zero stats.

    Regression for the 'show fake numbers' path: every numeric field
    must be 0 (or 1 for level) so the FE renders the empty branch
    rather than a fabricated streak.
    """
    response = await client.get(
        f"/api/v1/users/{authed_user['id']}/public", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()

    assert body["id"] == authed_user["id"]
    assert body["display_name"] == "Alice"
    # NEW fields wired by this PR — must be present and zero-ish.
    assert body["today_focus_minutes"] == 0
    assert body["streak_days"] == 0
    assert body["all_time_focus_hours"] == 0.0
    assert body["level"] == 1
    assert body["xp"] == 0
    # 2000 is the XP-per-level constant — verifies the schema isn't
    # silently returning a different bucket size.
    assert body["xp_next_level"] == 2000


@pytest.mark.asyncio
async def test_public_profile_reflects_completed_focus_session(
    client, auth_headers, authed_user
):
    """One completed focus session lifts today_focus_minutes + streak.

    Confirms the endpoint pulls live aggregates, not zeros baked into
    the schema defaults.
    """
    # Start + complete a session through the real API so the transition
    # is identical to what the FE drives.
    start = await client.post(
        "/api/v1/sessions",
        json={"mode": "focus", "duration_seconds": 1500},
        headers=auth_headers,
    )
    assert start.status_code == 201
    session_id = start.json()["id"]
    complete = await client.post(
        f"/api/v1/sessions/{session_id}/complete", headers=auth_headers
    )
    assert complete.status_code == 200

    response = await client.get(
        f"/api/v1/users/{authed_user['id']}/public", headers=auth_headers
    )
    body = response.json()
    # today_focus_minutes is completed-count * 25 (single tomato = 25min).
    assert body["today_focus_minutes"] == 25
    # Streak counts today as day 1.
    assert body["streak_days"] == 1
    # all_time_focus_hours rounds the wall-clock elapsed (here ~0s) so
    # the count itself isn't visible in hours yet — but the column must
    # be present and a float. Catches the case where the field is missing.
    assert isinstance(body["all_time_focus_hours"], (int, float))


@pytest.mark.asyncio
async def test_public_profile_404_for_unknown_user(client, auth_headers):
    """Unknown ID returns 404, not a stub profile.

    The previous behavior was correct; this test pins it so a future
    refactor doesn't quietly start fabricating empty profiles for
    user IDs that don't exist.
    """
    # A syntactically valid UUID that's not in the DB.
    response = await client.get(
        "/api/v1/users/00000000-0000-0000-0000-000000000000/public",
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_public_profile_does_not_leak_email_or_password(
    client, auth_headers, authed_user
):
    """Security regression: the response must never contain email /
    password_hash / marketing flags / is_bot — those would surface PII
    to any signed-in viewer.
    """
    response = await client.get(
        f"/api/v1/users/{authed_user['id']}/public", headers=auth_headers
    )
    body = response.json()
    forbidden = {"email", "password_hash", "marketing_opt_in", "is_bot"}
    leaked = forbidden & set(body.keys())
    assert leaked == set(), f"public profile leaked fields: {leaked}"
