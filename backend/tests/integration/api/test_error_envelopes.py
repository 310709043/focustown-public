"""Error-envelope sanitization regression tests (T0).

The generic ``Exception`` handler and the ``IntegrityError`` handler must
never let raw exception text, tracebacks, or SQL driver messages reach the
client. These tests inject failing test-only routes onto a freshly built
app so the handler contract is exercised directly — no DB needed, no
fragile race with the auth service's pre-checks.

Mirrors the lightweight ``_client()`` pattern used in
``tests/integration/middleware/test_request_id.py`` and
``tests/integration/api/test_observability_router.py``.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError


def _app_with_route(path: str, handler):
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
    app.get(path)(handler)
    # raise_server_exceptions=False lets the registered exception handlers
    # produce the JSON response we want to assert on; the default would
    # surface the original exception to the test before we could inspect it.
    return TestClient(app, raise_server_exceptions=False), patches


def _stop(patches):
    for p in patches:
        p.stop()


def test_unhandled_exception_returns_sanitized_500_envelope():
    async def _boom():
        # Payload simulates PII / secrets that careless code might
        # accidentally embed in an exception message.
        raise RuntimeError("password=hunter2 user@example.com")

    client, patches = _app_with_route("/__boom", _boom)
    try:
        with client:
            response = client.get("/__boom")
    finally:
        _stop(patches)

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "internal_error", "message": "internal_error"}
    }
    body = response.text
    assert "RuntimeError" not in body
    assert "hunter2" not in body
    assert "user@example.com" not in body
    assert "Traceback" not in body


def test_integrity_error_returns_sanitized_409_envelope():
    async def _dup():
        # Construct an IntegrityError whose ``orig`` carries the verbatim
        # Postgres driver message — the handler must drop it on the floor.
        raise IntegrityError(
            statement="INSERT INTO users (email) VALUES (:email)",
            params={"email": "x@y.z"},
            orig=Exception(
                'duplicate key value violates unique constraint "users_email_key"\n'
                "DETAIL: Key (email)=(x@y.z) already exists."
            ),
        )

    client, patches = _app_with_route("/__dup", _dup)
    try:
        with client:
            response = client.get("/__dup")
    finally:
        _stop(patches)

    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "conflict", "message": "conflict"}
    }
    body = response.text
    assert "users_email_key" not in body
    assert "duplicate key" not in body
    assert "x@y.z" not in body
