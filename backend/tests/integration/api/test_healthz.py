"""Smoke test for the integration fixture chain.

If this passes, testcontainers + alembic + the FastAPI app + the per-test
session override are all wired correctly. Subsequent router tests can rely
on the same fixtures.
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz_returns_ok(client):
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
