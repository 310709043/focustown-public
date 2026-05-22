"""Integration tests for Phase 09 DB observability + deep ``/ready``.

Why integration: SQLAlchemy event listeners attach to the *sync* engine
underneath the async wrapper. A unit test against ``AsyncEngine``
mocks misses the regression where the listener is attached to the
async engine and silently never fires. We therefore exercise the
listeners against a real Postgres container (already provisioned by
``tests/integration/conftest.py``).

What's verified:

* Every executed query increments ``db_query_total{op=<verb>}`` AND
  observes ``db_query_duration_ms{op=<verb>}``. Proves the after-hook
  fires AND classifies the verb correctly.
* When ``db_slow_query_ms`` is monkey-patched to ``0``, an executed
  query produces a ``db_slow_query`` log line whose payload omits the
  parameter binds (PII safety).
* ``/ready`` returns 200 against a healthy DB.
* ``/ready`` returns 503 when the write round-trip raises.

What is intentionally NOT verified: histogram bucket boundaries —
those are an internal detail of the lightweight metrics module
covered by its own unit test; flexing them here would couple the
integration to a tunable threshold.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
import structlog
from sqlalchemy import text

from app.core import metrics
from app.core.config import get_settings


@pytest.fixture(autouse=True)
def _reset_metrics():
    metrics.reset_all_for_tests()
    yield
    metrics.reset_all_for_tests()


@pytest_asyncio.fixture
async def observability_session(integration_env):
    """Session bound to the app's ``get_engine`` so listeners are wired.

    The default ``db_session`` fixture in conftest creates a fresh
    engine via ``create_async_engine`` directly, bypassing
    ``app.infrastructure.db.session.get_engine`` where the Phase 09
    listeners are installed. That fixture exists to give tests a
    transactional savepoint they can rollback; here we need the
    production engine path to exercise the actual listener attachment.
    """
    from app.infrastructure.db.session import (
        dispose_engine,
        get_engine,
        get_session_factory,
    )

    factory = get_session_factory(integration_env["DATABASE_URL"])
    # Touch the engine so the listener is installed.
    get_engine(integration_env["DATABASE_URL"])
    async with factory() as session:
        yield session
    await dispose_engine()


async def test_select_emits_counter_and_histogram(observability_session) -> None:
    """A plain SELECT records a 'select' counter + histogram observation."""
    metrics.reset_all_for_tests()
    await observability_session.execute(text("SELECT 1"))
    assert metrics.db_query_total.value(op="select") >= 1
    assert metrics.db_query_duration_ms.count(op="select") >= 1
    assert metrics.db_query_duration_ms.sum(op="select") > 0


async def test_insert_classified_as_insert_op(observability_session) -> None:
    """INSERT statements fall under op='insert', not 'other'."""
    metrics.reset_all_for_tests()
    await observability_session.execute(
        text("INSERT INTO health_probe (id) VALUES (:id)"),
        {"id": "test-classify-insert"},
    )
    await observability_session.execute(
        text("DELETE FROM health_probe WHERE id = :id"),
        {"id": "test-classify-insert"},
    )
    await observability_session.rollback()
    assert metrics.db_query_total.value(op="insert") >= 1
    assert metrics.db_query_total.value(op="delete") >= 1


async def test_slow_query_log_emitted_when_threshold_zero(
    observability_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With the slow-query threshold at 0ms, every query logs.

    Also asserts the log line does NOT include parameter binds — those
    can carry PII and must never reach disk.
    """
    settings = get_settings()
    monkeypatch.setattr(settings, "db_slow_query_ms", 0)

    cap_processor = structlog.testing.LogCapture()
    structlog.configure(processors=[cap_processor])
    captured = cap_processor.entries

    secret_email = "victim@example.com"
    await observability_session.execute(
        text("SELECT id FROM health_probe WHERE id = :id"),
        {"id": secret_email},
    )

    slow_events = [e for e in captured if e.get("event") == "db_slow_query"]
    assert slow_events, "expected at least one db_slow_query log line"
    payload = slow_events[-1]
    assert "statement" in payload
    # Parameter binds (which would carry PII) must never appear.
    assert secret_email not in str(payload), (
        "slow-query log leaked a bound parameter — PII / credentials "
        "could land in production logs"
    )
    assert payload.get("op") in {"select", "insert", "update", "delete", "other"}


async def test_listener_attached_to_sync_engine(observability_session) -> None:
    """Regression guard: SQLAlchemy event listeners on an async engine
    only fire when attached to ``engine.sync_engine``. Attaching to
    the async wrapper directly is a silent no-op. We prove the
    listener is wired correctly by observing a fresh query bumps the
    counter."""
    metrics.reset_all_for_tests()
    await observability_session.execute(text("SELECT 42"))
    assert metrics.db_query_duration_ms.count(op="select") >= 1


async def test_ready_endpoint_returns_200_on_healthy_db(client) -> None:
    response = await client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body.get("db") == "up"


async def test_ready_endpoint_returns_503_when_write_fails(
    client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the health_probe INSERT raises, /ready reports db=down → 503."""

    async def _boom(*args, **kwargs):
        raise RuntimeError("simulated PG write failure")

    monkeypatch.setattr(
        "app.main._db_write_roundtrip", _boom
    )
    response = await client.get("/ready")
    assert response.status_code == 503
    assert response.json().get("db") == "down"
