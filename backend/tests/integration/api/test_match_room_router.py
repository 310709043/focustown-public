"""HTTP-level tests for ``/rooms/match/{match_id}/*``.

What this pins:
- Accepting a match auto-creates the shared room — GET returns 200
  with the snapshot for either participant.
- Non-participants get 404 (NOT 403): room existence must not leak
  through the response code or the error envelope.
- ``join`` on first side keeps the room ``open``; second side transitions
  it to ``both_joined``.
- ``leave`` on both sides transitions the room to ``ended`` with
  ``both_left`` as the reason.
"""
from __future__ import annotations

import pytest

from app.core.config import get_settings


async def _signup(
    client, *, email: str, name: str, password: str = "Sup3rSecret-zzz"
) -> dict:
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
    body = response.json()
    return {
        "id": body["user"]["id"],
        "token": body["tokens"]["access_token"],
    }


async def _accepted_match(client, alice_headers: dict, bob_id: str) -> str:
    """Helper: propose + accept (by Bob) → returns the match_id.

    The accept side-effect materialises the match-room via
    ``MatchingService.accept`` which is the production code path under
    test here.
    """
    propose = await client.post(
        "/api/v1/matches",
        json={"candidate_id": bob_id},
        headers=alice_headers,
    )
    propose.raise_for_status()
    return propose.json()["id"]


@pytest.mark.asyncio
async def test_accept_materialises_room_and_get_returns_snapshot(
    client, authed_user, auth_headers
):
    bob = await _signup(client, email="bob@example.com", name="Bob")
    bob_headers = {"Authorization": f"Bearer {bob['token']}"}

    match_id = await _accepted_match(client, auth_headers, bob["id"])
    accept = await client.post(
        f"/api/v1/matches/{match_id}/accept", headers=bob_headers
    )
    accept.raise_for_status()

    snap = await client.get(
        f"/api/v1/rooms/match/{match_id}", headers=auth_headers
    )
    assert snap.status_code == 200
    body = snap.json()
    assert body["match_id"] == match_id
    assert body["status"] == "open"
    assert len(body["participants"]) == 2
    assert {p["user_id"] for p in body["participants"]} == {
        authed_user["id"],
        bob["id"],
    }


@pytest.mark.asyncio
async def test_non_participant_get_returns_404(
    client, authed_user, auth_headers
):
    bob = await _signup(client, email="bob@example.com", name="Bob")
    bob_headers = {"Authorization": f"Bearer {bob['token']}"}
    carol = await _signup(client, email="carol@example.com", name="Carol")
    carol_headers = {"Authorization": f"Bearer {carol['token']}"}

    match_id = await _accepted_match(client, auth_headers, bob["id"])
    await client.post(
        f"/api/v1/matches/{match_id}/accept", headers=bob_headers
    )

    # Carol is not a participant — 404 not 403.
    response = await client.get(
        f"/api/v1/rooms/match/{match_id}", headers=carol_headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_join_first_then_second_transitions_to_both_joined(
    client, authed_user, auth_headers
):
    bob = await _signup(client, email="bob@example.com", name="Bob")
    bob_headers = {"Authorization": f"Bearer {bob['token']}"}
    match_id = await _accepted_match(client, auth_headers, bob["id"])
    await client.post(
        f"/api/v1/matches/{match_id}/accept", headers=bob_headers
    )

    first = await client.post(
        f"/api/v1/rooms/match/{match_id}/join", headers=auth_headers
    )
    assert first.status_code == 200
    assert first.json()["status"] == "open"

    second = await client.post(
        f"/api/v1/rooms/match/{match_id}/join", headers=bob_headers
    )
    assert second.status_code == 200
    assert second.json()["status"] == "both_joined"


@pytest.mark.asyncio
async def test_leave_both_sides_transitions_to_ended(
    client, authed_user, auth_headers
):
    bob = await _signup(client, email="bob@example.com", name="Bob")
    bob_headers = {"Authorization": f"Bearer {bob['token']}"}
    match_id = await _accepted_match(client, auth_headers, bob["id"])
    await client.post(
        f"/api/v1/matches/{match_id}/accept", headers=bob_headers
    )

    await client.post(
        f"/api/v1/rooms/match/{match_id}/leave", headers=auth_headers
    )
    second = await client.post(
        f"/api/v1/rooms/match/{match_id}/leave", headers=bob_headers
    )
    body = second.json()
    assert body["status"] == "ended"
    assert body["ended_reason"] == "both_left"


@pytest.mark.asyncio
async def test_join_by_non_participant_returns_404(client, auth_headers):
    bob = await _signup(client, email="bob@example.com", name="Bob")
    bob_headers = {"Authorization": f"Bearer {bob['token']}"}
    carol = await _signup(client, email="carol@example.com", name="Carol")
    carol_headers = {"Authorization": f"Bearer {carol['token']}"}

    match_id = await _accepted_match(client, auth_headers, bob["id"])
    await client.post(
        f"/api/v1/matches/{match_id}/accept", headers=bob_headers
    )

    response = await client.post(
        f"/api/v1/rooms/match/{match_id}/join", headers=carol_headers
    )
    assert response.status_code == 404
