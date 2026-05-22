"""Phase 01: exception-envelope mapping for transient + stale DB errors.

Why these tests exist
---------------------
Before Phase 01, ``OperationalError`` (connection lost, pool exhaustion,
deadlock victim) and ``StaleDataError`` (ORM optimistic-locking miss) were
swallowed by the catch-all 500 handler. That hid retryable failures from
clients and dressed up legitimate write conflicts as internal errors. The
two handlers added in ``app/main.py`` now surface them as 503
(``Retry-After: 5``) and 409 respectively.

The tests register a throwaway route on the real FastAPI app produced by
``create_app()`` and trigger each exception path through the actual ASGI
stack — middleware, exception handlers, response shape — so the
envelope and headers are exercised end-to-end without needing a real
Postgres or a fixture pool to exhaust.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm.exc import StaleDataError


def _client_with_routes():
    """Create a fully-wired test app with stubbed lifespan + 2 raising routes."""
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

    fastapi_app = create_app()

    @fastapi_app.get("/__test__/operational")
    def _raise_operational() -> None:
        raise OperationalError("SELECT 1", {}, Exception("connection lost"))

    @fastapi_app.get("/__test__/stale")
    def _raise_stale() -> None:
        raise StaleDataError("row vanished mid-write")

    return TestClient(fastapi_app), patches


def _stop(patches):
    for p in patches:
        p.stop()


def test_operational_error_returns_503_with_retry_after():
    client, patches = _client_with_routes()
    try:
        with client:
            response = client.get("/__test__/operational")
    finally:
        _stop(patches)

    assert response.status_code == 503
    assert response.headers.get("retry-after") == "5"
    body = response.json()
    assert body == {
        "error": {"code": "service_unavailable", "message": "service_unavailable"}
    }


def test_stale_data_error_returns_409_conflict_envelope():
    client, patches = _client_with_routes()
    try:
        with client:
            response = client.get("/__test__/stale")
    finally:
        _stop(patches)

    assert response.status_code == 409
    body = response.json()
    assert body == {"error": {"code": "conflict", "message": "conflict"}}


def test_service_unavailable_error_is_raisable_from_services():
    """Services can raise ``ServiceUnavailableError`` directly; the
    generic ``LowBatteryTownError`` handler renders it as 503.

    Note: the domain handler does NOT add ``Retry-After`` — that header is
    specific to the ``OperationalError`` path where clients should always
    back off. Service-level raises may not always warrant a fixed delay.
    """
    from app.core.exceptions import ServiceUnavailableError

    err = ServiceUnavailableError("downstream timed out")
    assert err.status_code == 503
    assert err.code == "service_unavailable"

    client, patches = _client_with_routes()

    @client.app.get("/__test__/service-unavailable")
    def _raise_service_unavailable() -> None:
        raise ServiceUnavailableError("downstream timed out")

    try:
        with client:
            response = client.get("/__test__/service-unavailable")
    finally:
        _stop(patches)

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "service_unavailable"
    assert body["error"]["message"] == "downstream timed out"
