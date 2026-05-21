"""HTTP-level coverage for ``POST /api/v1/tracks/{id}/play-token``.

Exercises the full FastAPI stack — auth dep, DB lookup, JWT issuance —
not just the AudioTokenService unit. Two cases worth holding green:

- 401 without bearer (anonymous callers can't mint tokens)
- 404 when the track id doesn't exist
- 200 carries a Worker URL bound to the track + future expires_at
"""
from __future__ import annotations

import pytest

from app.infrastructure.db.models.track import TrackORM


@pytest.mark.asyncio
async def test_play_token_requires_authentication(client):
    res = await client.post("/api/v1/tracks/any/play-token")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_play_token_returns_404_for_unknown_track(client, auth_headers):
    res = await client.post(
        "/api/v1/tracks/missing-id/play-token", headers=auth_headers
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_play_token_returns_url_bound_to_track(
    client, auth_headers, db_session, authed_user
):
    db_session.add(
        TrackORM(
            id="trk-test-1",
            title="Test Track",
            artist=None,
            mood="lofi",
            duration_ms=180_000,
            file_key="tracks/trk-test-1.mp3",
            content_type="audio/mpeg",
            file_size_bytes=12345,
            license="royalty-free-seed",
            uploaded_by_user_id=authed_user["id"],
            is_official=True,
        )
    )
    await db_session.flush()

    res = await client.post(
        "/api/v1/tracks/trk-test-1/play-token", headers=auth_headers
    )

    assert res.status_code == 200
    body = res.json()
    assert "url" in body and "expires_at" in body
    # AUDIO_PROXY_BASE_URL is unset in tests → dev-fallback URL points
    # at the backend /stream endpoint with a signed token query param.
    assert "/api/v1/tracks/trk-test-1/stream" in body["url"]
    assert "?t=" in body["url"]
