from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient


def _client():
    """Build a TestClient with external services stubbed.

    Mirrors `test_security_headers._client` — RequestIDMiddleware is
    process-local and never reaches Redis/DB, so we can avoid the
    container-backed `app` fixture and run as a flat unit-style test.
    """
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


def test_request_id_passes_through_when_supplied():
    client, patches = _client()
    try:
        with client:
            response = client.get(
                "/healthz", headers={"X-Request-ID": "client-supplied-id"}
            )
    finally:
        _stop(patches)
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == "client-supplied-id"


def test_request_id_generated_when_missing():
    client, patches = _client()
    try:
        with client:
            response = client.get("/healthz")
    finally:
        _stop(patches)
    assert response.status_code == 200
    rid = response.headers.get("x-request-id")
    assert rid is not None
    # uuid4().hex is 32 lowercase hex chars.
    assert len(rid) == 32
    assert all(c in "0123456789abcdef" for c in rid)


def test_blank_request_id_header_is_treated_as_missing():
    client, patches = _client()
    try:
        with client:
            response = client.get("/healthz", headers={"X-Request-ID": "   "})
    finally:
        _stop(patches)
    assert response.status_code == 200
    rid = response.headers.get("x-request-id")
    assert rid is not None
    assert rid != "   "
    assert len(rid) == 32


def test_each_request_gets_distinct_generated_id():
    client, patches = _client()
    try:
        with client:
            r1 = client.get("/healthz")
            r2 = client.get("/healthz")
    finally:
        _stop(patches)
    assert r1.headers["x-request-id"] != r2.headers["x-request-id"]


def test_oversized_request_id_is_replaced():
    client, patches = _client()
    huge = "a" * 5000
    try:
        with client:
            response = client.get("/healthz", headers={"X-Request-ID": huge})
    finally:
        _stop(patches)
    rid = response.headers["x-request-id"]
    assert rid != huge
    assert len(rid) == 32


def test_request_id_with_disallowed_chars_is_replaced():
    client, patches = _client()
    try:
        with client:
            # Quotes, braces and whitespace within would mangle JSON logs.
            response = client.get(
                "/healthz", headers={"X-Request-ID": 'abc"; rm -rf'}
            )
    finally:
        _stop(patches)
    rid = response.headers["x-request-id"]
    assert rid != 'abc"; rm -rf'
    assert len(rid) == 32
