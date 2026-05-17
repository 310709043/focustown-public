"""Forgot-password rate-limit regression test.

The signin rate-limit envelope is already covered in ``test_auth_router.py``;
this file pins the equivalent guarantee on ``/forgot-password``, which has
two limits: per-IP (5/hr) and per-email (3/hr). The email limit trips first
for a fixed-email victim — that's the security-critical case (one address
being spammed with reset mails) and matches the signin test's email-window
shape, so we test that path.
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_forgot_password_email_rate_limit_returns_429_envelope(
    client, flushed_redis
):
    # auth_rl_forgot_per_email_per_hour defaults to 3, so the 4th identical
    # request for the same email must be the one that 429s. The per-IP
    # check (default 5) is evaluated first; it still passes on hit 4
    # because IP count = 4 ≤ 5, then email count = 4 > 3 trips.
    statuses = []
    for _ in range(4):
        r = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "victim@example.com"},
        )
        statuses.append(r.status_code)

    assert statuses[:3] == [200, 200, 200]
    assert statuses[3] == 429

    # The final response must use the standard envelope shape so the frontend
    # error boundary can map the code without parsing message text.
    last = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "victim@example.com"},
    )
    assert last.status_code == 429
    assert last.json()["error"]["message"] == "rate_limited"
