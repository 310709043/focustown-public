"""Matches router integration tests.

Worth testing:
- propose with self → 409
- accept by a stranger → 409
- recent returns matches the user participates in
- propose without bearer → 401
- candidate_character_key is hydrated on propose & accept responses so
  the frontend MatchModal can render the candidate sprite without a
  second round-trip

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


@pytest.mark.asyncio
async def test_propose_response_hydrates_candidate_character_key(
    client, auth_headers
):
    """The MatchResponse must carry the candidate's character_key so the
    frontend modal can render the sprite without a second user lookup.
    """
    await _signup(client, email="dave@example.com", name="Dave")
    dave_signin = await client.post(
        "/api/v1/auth/signin",
        json={"email": "dave@example.com", "password": "Sup3rSecret-zzz"},
    )
    dave_token = dave_signin.json()["tokens"]["access_token"]
    dave_id = dave_signin.json()["user"]["id"]
    # Pick a character on Dave's profile so we have something to assert.
    await client.patch(
        "/api/v1/users/me",
        json={"character_key": "luna"},
        headers={"Authorization": f"Bearer {dave_token}"},
    )

    propose = await client.post(
        "/api/v1/matches",
        json={"candidate_id": dave_id},
        headers=auth_headers,
    )

    assert propose.status_code == 201
    assert propose.json()["candidate_character_key"] == "luna"


@pytest.mark.asyncio
async def test_accept_response_hydrates_candidate_character_key(
    client, auth_headers
):
    await _signup(client, email="erin@example.com", name="Erin")
    erin_signin = await client.post(
        "/api/v1/auth/signin",
        json={"email": "erin@example.com", "password": "Sup3rSecret-zzz"},
    )
    erin_token = erin_signin.json()["tokens"]["access_token"]
    erin_id = erin_signin.json()["user"]["id"]
    await client.patch(
        "/api/v1/users/me",
        json={"character_key": "kai"},
        headers={"Authorization": f"Bearer {erin_token}"},
    )

    propose = await client.post(
        "/api/v1/matches",
        json={"candidate_id": erin_id},
        headers=auth_headers,
    )
    match_id = propose.json()["id"]

    accept = await client.post(
        f"/api/v1/matches/{match_id}/accept",
        headers={"Authorization": f"Bearer {erin_token}"},
    )

    assert accept.status_code == 200
    assert accept.json()["candidate_character_key"] == "kai"


@pytest.mark.asyncio
async def test_get_match_returns_both_character_keys(client, auth_headers):
    """GET /matches/{id} hydrates both requester + candidate character_key
    so the focus room can render the pairing header regardless of which
    side the viewer is on (post-reload rehydration path)."""
    await _signup(client, email="frank@example.com", name="Frank")
    frank_signin = await client.post(
        "/api/v1/auth/signin",
        json={"email": "frank@example.com", "password": "Sup3rSecret-zzz"},
    )
    frank_token = frank_signin.json()["tokens"]["access_token"]
    frank_id = frank_signin.json()["user"]["id"]
    await client.patch(
        "/api/v1/users/me",
        json={"character_key": "milo"},
        headers={"Authorization": f"Bearer {frank_token}"},
    )
    # Requester picks a character too so we can assert hydration.
    await client.patch(
        "/api/v1/users/me",
        json={"character_key": "luna"},
        headers=auth_headers,
    )

    propose = await client.post(
        "/api/v1/matches",
        json={"candidate_id": frank_id},
        headers=auth_headers,
    )
    match_id = propose.json()["id"]

    response = await client.get(
        f"/api/v1/matches/{match_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == match_id
    assert body["requester_character_key"] == "luna"
    assert body["candidate_character_key"] == "milo"


@pytest.mark.asyncio
async def test_get_match_by_stranger_returns_forbidden(client, auth_headers):
    await _signup(client, email="gus@example.com", name="Gus")
    gus_signin = await client.post(
        "/api/v1/auth/signin",
        json={"email": "gus@example.com", "password": "Sup3rSecret-zzz"},
    )
    gus_id = gus_signin.json()["user"]["id"]
    propose = await client.post(
        "/api/v1/matches",
        json={"candidate_id": gus_id},
        headers=auth_headers,
    )
    match_id = propose.json()["id"]

    stranger_token = await _signup(client, email="harry@example.com", name="Harry")
    response = await client.get(
        f"/api/v1/matches/{match_id}",
        headers={"Authorization": f"Bearer {stranger_token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_match_unknown_returns_not_found(client, auth_headers):
    response = await client.get(
        "/api/v1/matches/00000000-0000-0000-0000-000000000000",
        headers=auth_headers,
    )
    assert response.status_code == 404
