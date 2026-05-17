"""Integration tests for /api/v1/observability/client-errors.

The endpoint has no DB dependency and the only external collaborator is
`IRateLimiter`, so we override that with `MemoryRateLimiter` and run via
the in-process `TestClient`. This mirrors `middleware/test_security_headers`
rather than the heavy testcontainer chain — we get deterministic rate-limit
windows per test without depending on a Redis container.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import structlog
from fastapi.testclient import TestClient

from app.core.deps import get_rate_limiter
from app.infrastructure.rate_limit.memory_limiter import MemoryRateLimiter


def _client():
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

    app = create_app()
    limiter = MemoryRateLimiter()
    app.dependency_overrides[get_rate_limiter] = lambda: limiter
    return TestClient(app), patches


def _stop(patches):
    for p in patches:
        p.stop()


def test_client_error_accepted_with_log_line():
    client, patches = _client()
    try:
        with client, structlog.testing.capture_logs() as captured:
            response = client.post(
                "/api/v1/observability/client-errors",
                json={
                    "message": "TypeError: Cannot read property 'x' of undefined",
                    "stack": "at App.render (App.tsx:42)",
                    "request_id": "browser-correlated-id",
                    "route": "/town",
                },
            )
    finally:
        _stop(patches)

    assert response.status_code == 202
    assert response.json() == {"ok": True}

    errors = [e for e in captured if e["event"] == "client_error"]
    assert len(errors) == 1
    assert errors[0]["message"].startswith("TypeError")
    assert errors[0]["client_request_id"] == "browser-correlated-id"
    assert errors[0]["client_route"] == "/town"


def test_client_error_rate_limited_after_threshold():
    client, patches = _client()
    payload = {"message": "boom"}
    try:
        with client:
            statuses = [
                client.post(
                    "/api/v1/observability/client-errors", json=payload
                ).status_code
                for _ in range(11)
            ]
    finally:
        _stop(patches)

    # First 10 land, 11th gets the standard rate-limit envelope.
    assert statuses[:10] == [202] * 10
    assert statuses[10] == 429


def test_client_error_rejects_empty_message():
    client, patches = _client()
    try:
        with client:
            response = client.post(
                "/api/v1/observability/client-errors", json={"message": ""}
            )
    finally:
        _stop(patches)
    # Pydantic min_length=1 enforced before the handler runs.
    assert response.status_code == 422
