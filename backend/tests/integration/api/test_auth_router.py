"""Auth router integration tests against real Postgres + Redis.

What's worth testing here:
- signup persists user + consent fields + hashed password (NOT the plaintext)
- signin returns access + refresh tokens against the persisted hash
- /me requires a bearer token (401 otherwise) and reflects the signed-in user
- refresh returns a fresh token pair (we don't pin specific values; rotation
  is implementation detail)
- forgot-password is a public endpoint that does not leak whether the
  email exists (always 200) — anti-enumeration is a real security guarantee
- rate limit returns 429 with the standard error envelope after threshold

What's NOT worth testing here:
- Each Pydantic field-level validation failure — Pydantic owns that
- The exact shape of every successful DTO — pinned in OpenAPI types
"""
from __future__ import annotations

import pytest

from app.core.config import get_settings


@pytest.fixture
def signup_payload() -> dict:
    return {
        "email": "newuser@example.com",
        "password": "Sup3rSecret-bbb",
        "display_name": "New User",
        "terms_accepted": True,
        "terms_version": get_settings().terms_current_version,
        "marketing_opt_in": False,
    }


# ── signup ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_signup_persists_user_with_hashed_password(client, signup_payload, db_session):
    from sqlalchemy import text

    response = await client.post("/api/v1/auth/signup", json=signup_payload)

    assert response.status_code == 201
    user_id = response.json()["user"]["id"]
    row = (
        await db_session.execute(
            text("SELECT email, password_hash FROM users WHERE id = :id"),
            {"id": user_id},
        )
    ).one()
    assert row.email == "newuser@example.com"
    assert row.password_hash != "Sup3rSecret-bbb"
    assert row.password_hash.startswith("$2")  # bcrypt prefix


@pytest.mark.asyncio
async def test_signup_returns_token_pair(client, signup_payload):
    response = await client.post("/api/v1/auth/signup", json=signup_payload)
    body = response.json()
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]


@pytest.mark.asyncio
async def test_signup_rejects_old_terms_version(client, signup_payload):
    signup_payload["terms_version"] = "1999-01-01"
    response = await client.post("/api/v1/auth/signup", json=signup_payload)
    assert response.status_code == 422
    # `code` is the FocusTownError class code; the specific identifier
    # lives in `message`.
    assert response.json()["error"]["message"] == "terms_version_mismatch"


# ── signin ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_signin_returns_tokens_for_valid_credentials(
    client, authed_user
):
    response = await client.post(
        "/api/v1/auth/signin",
        json={"email": authed_user["email"], "password": authed_user["password"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["tokens"]["access_token"]


@pytest.mark.asyncio
async def test_signin_rejects_wrong_password(client, authed_user):
    response = await client.post(
        "/api/v1/auth/signin",
        json={"email": authed_user["email"], "password": "wrong-password-here"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "invalid_credentials"


# ── /me ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_me_returns_signed_in_user(client, authed_user, auth_headers):
    response = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == authed_user["id"]


@pytest.mark.asyncio
async def test_me_requires_bearer_token(client):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


# ── refresh ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_returns_new_token_pair(client, authed_user):
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": authed_user["refresh_token"]},
    )
    assert response.status_code == 200
    assert response.json()["access_token"]


# ── forgot-password / reset-password ───────────────────────────────────────


@pytest.mark.asyncio
async def test_forgot_password_always_returns_ok_for_unknown_email(client):
    response = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "noone@example.com"},
    )
    assert response.status_code == 200


# ── rate limit envelope ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_signin_rate_limit_returns_429_envelope(
    client, authed_user, flushed_redis
):
    # The signin email limit is 5 per 60s. Hit it six times with a
    # syntactically valid (8+ char) but wrong password.
    responses = []
    for _ in range(6):
        r = await client.post(
            "/api/v1/auth/signin",
            json={"email": authed_user["email"], "password": "wrong-pw-attempt"},
        )
        responses.append(r)
    last = responses[-1]
    assert last.status_code == 429
    assert last.json()["error"]["message"] == "rate_limited"
