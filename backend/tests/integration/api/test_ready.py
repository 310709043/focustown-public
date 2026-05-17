"""Deep healthcheck coverage.

``/healthz`` stays a fast liveness probe — its test already lives in
``test_healthz.py``. ``/ready`` proves each downstream dependency answers
within 500ms; this file covers both the all-up happy path (real
containers) and the redis-down failure path (DI override).
"""
from __future__ import annotations

import asyncio

import pytest


@pytest.mark.asyncio
async def test_ready_returns_200_when_all_deps_up(client):
    response = await client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body == {"db": "up", "redis": "up", "secrets": "up"}


@pytest.mark.asyncio
async def test_ready_returns_503_when_redis_down(client, app, monkeypatch):
    # Replace the module-level redis client with a stub whose ping() hangs
    # past the 500ms timeout — exercises the asyncio.wait_for path in /ready
    # without killing the live container (other tests still need it).
    class _StuckRedis:
        async def ping(self) -> None:
            await asyncio.sleep(5)

        async def close(self) -> None:
            # No-op so the app fixture's teardown call to close_redis() doesn't
            # AttributeError if monkeypatch hasn't restored _client yet.
            return None

    import app.infrastructure.cache.redis_client as redis_mod

    monkeypatch.setattr(redis_mod, "_client", _StuckRedis())

    response = await client.get("/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["redis"] == "down"
    # DB + secrets should remain up — proves the per-dependency timeout
    # isolation works (one slow dep doesn't poison the rest).
    assert body["db"] == "up"
    assert body["secrets"] == "up"
