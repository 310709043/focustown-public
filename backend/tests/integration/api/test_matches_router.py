"""Matches router integration tests.

Worth testing:
- propose with self → 409
- accept by a stranger → 409
- recent returns matches the user participates in
- propose without bearer → 401

NOT worth testing:
- The compatibility score value — covered by SimpleOverlapStrategy unit
  tests and not stable enough to pin in an integration test
"""
from __future__ import annotations

import pytest

from app.core.config import get_settings


async def _signup(client, *, email: str, name: str, password: str = "Sup3rSecret-zzz") -> str:
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": password,
            "display_name": name,
            "terms_accepted": True,
            "terms_version": get_settings().terms_current_version,
            "marketing_opt_in": False,
        },
    )
    response.raise_for_status()
    return response.json()["tokens"]["access_token"]


@pytest.mark.asyncio
async def test_propose_self_returns_conflict(
    client, authed_user, auth_headers
):
    response = await client.post(
        "/api/v1/matches",
        json={"candidate_id": authed_user["id"]},
        headers=auth_headers,
    )
    assert response.status_code == 409
    assert response.json()["error"]["message"] == "cannot_match_self"


@pytest.mark.asyncio
async def test_accept_by_stranger_returns_conflict(
    client, authed_user, auth_headers
):
    await _signup(client, email="bob@example.com", name="Bob")
    bob_signin = await client.post(
        "/api/v1/auth/signin",
        json={"email": "bob@example.com", "password": "Sup3rSecret-zzz"},
    )
    bob_id = bob_signin.json()["user"]["id"]

    propose = await client.post(
        "/api/v1/matches",
        json={"candidate_id": bob_id},
        headers=auth_headers,
    )
    match_id = propose.json()["id"]

    carol_token = await _signup(client, email="carol@example.com", name="Carol")
    response = await client.post(
        f"/api/v1/matches/{match_id}/accept",
        headers={"Authorization": f"Bearer {carol_token}"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["message"] == "not_match_member"


@pytest.mark.asyncio
async def test_propose_requires_bearer(client):
    response = await client.post(
        "/api/v1/matches", json={"candidate_id": "anything"}
    )
    assert response.status_code == 401
