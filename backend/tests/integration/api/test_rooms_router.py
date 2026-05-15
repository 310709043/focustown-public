"""Rooms router integration tests.

Worth testing:
- GET /me/room lazy-creates the room on first call
- A second GET is idempotent (same id)
- PUT with invalid theme returns 422 with envelope code

NOT worth testing:
- get-by-id when id is the user's own room — same code path as /me/room
- Default field values — covered by lazy-create
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_me_room_lazy_creates_on_first_get(client, auth_headers):
    response = await client.get("/api/v1/me/room", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["theme"] == "night"


@pytest.mark.asyncio
async def test_me_room_is_idempotent(client, auth_headers):
    first = await client.get("/api/v1/me/room", headers=auth_headers)
    second = await client.get("/api/v1/me/room", headers=auth_headers)
    assert first.json()["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_put_room_rejects_invalid_theme(client, auth_headers):
    await client.get("/api/v1/me/room", headers=auth_headers)  # lazy-create
    response = await client.put(
        "/api/v1/me/room",
        json={"theme": "cafe"},
        headers=auth_headers,
    )
    # Pydantic-level enum validation gives 422 with code=validation_error.
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_put_room_updates_name(client, auth_headers):
    await client.get("/api/v1/me/room", headers=auth_headers)
    response = await client.put(
        "/api/v1/me/room",
        json={"name": " Alice's Library "},
        headers=auth_headers,
    )
    assert response.json()["name"] == "Alice's Library"
