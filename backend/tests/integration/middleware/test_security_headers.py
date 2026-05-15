from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def _client():
    # Stub redis / DB so lifespan doesn't try to reach external services.
    # The wallet subscriber registration in lifespan opens a session factory,
    # which requires asyncpg at import time even though we never run a query.
    from unittest.mock import MagicMock

    patches = [
        patch("app.main.init_redis", AsyncMock(return_value=None)),
        patch("app.main.close_redis", AsyncMock(return_value=None)),
        patch("app.main.dispose_engine", AsyncMock(return_value=None)),
        patch("app.main.get_redis", MagicMock(return_value=None)),
        patch("app.main.get_session_factory", MagicMock(return_value=MagicMock())),
        patch("app.main.CoinAwardService", MagicMock()),
    ]
    for p in patches:
        p.start()

    from app.main import create_app

    return TestClient(create_app()), patches


def _stop(patches):
    for p in patches:
        p.stop()


def test_security_headers_present_on_healthz():
    client, patches = _client()
    try:
        with client:
            response = client.get("/healthz")
    finally:
        _stop(patches)
    assert response.status_code == 200
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "no-referrer"
    assert "permissions-policy" in response.headers


def test_hsts_only_in_production():
    client, patches = _client()
    try:
        with client:
            response = client.get("/healthz")
    finally:
        _stop(patches)
    # default env is "test" via conftest — HSTS should NOT be present
    assert "strict-transport-security" not in {k.lower() for k in response.headers}
