"""SQLAlchemy engine event listeners for per-query telemetry.

What this gives operators:

* ``db_query_total{op}`` — every cursor execution increments, labelled
  by SQL verb (``select`` | ``insert`` | ``update`` | ``delete`` |
  ``other``). Lets dashboards graph QPS by query kind without parsing
  application logs.
* ``db_query_duration_ms{op}`` — histogram of cursor latencies.
  p50/p95/p99 by verb is the headline DB SLI; alerting fires off the
  tail of this histogram.
* ``db_slow_query`` structured log — fired once per query above
  ``settings.db_slow_query_ms`` (default 200ms). Includes a
  ``statement`` preview but NEVER the parameter binds (which may carry
  PII — emails, refresh tokens, etc.). Capped at 200 characters so a
  multi-megabyte ``WHERE id IN (...)`` doesn't blow up the log line.

OpenTelemetry boot is in :func:`init_otel`. Imports are deferred inside
the function because the OTel SDK adds multi-second cold-start cost in
some environments and the no-op path (default) must skip them.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

from sqlalchemy import event

from app.core import metrics
from app.core.config import get_settings
from app.core.logging import get_logger

if TYPE_CHECKING:
    from fastapi import FastAPI
    from sqlalchemy.ext.asyncio import AsyncEngine

log = get_logger(__name__)

_STATEMENT_PREVIEW_LIMIT = 200
_QUERY_START_ATTR = "_focustown_query_start_ms"


def _classify_op(statement: str) -> str:
    """Map the leading keyword of a SQL statement to a coarse op label.

    Anything we don't recognise becomes ``other`` so the label set stays
    bounded. Prometheus cardinality explodes if labels are user-derived.
    """
    if not statement:
        return "other"
    head = statement.lstrip().split(None, 1)
    if not head:
        return "other"
    verb = head[0].lower()
    if verb in ("select", "insert", "update", "delete"):
        return verb
    return "other"


def install_engine_event_listeners(engine: AsyncEngine) -> None:
    """Attach before/after-cursor-execute hooks for metrics + slow log.

    Async engines wrap a sync engine internally — listeners MUST be
    attached to ``engine.sync_engine`` or they silently never fire.
    Test for this regression explicitly.
    """
    sync_engine = engine.sync_engine

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _before(
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        # Stash on the execution context — SQLAlchemy keeps it for the
        # matching after-execute call on the same connection.
        setattr(context, _QUERY_START_ATTR, time.perf_counter())

    @event.listens_for(sync_engine, "after_cursor_execute")
    def _after(
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        start = getattr(context, _QUERY_START_ATTR, None)
        if start is None:
            # Defensive: if before_ didn't run (driver weirdness), skip.
            return
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        op_label = _classify_op(statement)
        metrics.db_query_total.labels(op=op_label).inc()
        metrics.db_query_duration_ms.labels(op=op_label).observe(elapsed_ms)
        threshold = get_settings().db_slow_query_ms
        if elapsed_ms >= threshold:
            log.warning(
                "db_slow_query",
                op=op_label,
                elapsed_ms=round(elapsed_ms, 1),
                threshold_ms=threshold,
                statement=statement[:_STATEMENT_PREVIEW_LIMIT],
                executemany=executemany,
            )


def init_otel(app: FastAPI, engine: AsyncEngine | None) -> None:
    """Install OpenTelemetry instrumentation when ``OTEL_ENABLED=true``.

    Default is off: ``opentelemetry-*`` packages add measurable import
    cost (multi-second cold start on small instances) and the SDK keeps
    background threads alive even when nothing exports. The whole
    branch is gated by ``settings.otel_enabled`` and the imports are
    *deferred* — production sets the env var, dev / test never pay the
    price.

    The OTLP endpoint is configured via ``OTEL_EXPORTER_OTLP_ENDPOINT``
    (read by the SDK directly from env) or
    ``settings.otel_exporter_otlp_endpoint`` if set explicitly.
    """
    settings = get_settings()
    if not settings.otel_enabled:
        return

    # Deferred imports — see docstring. ImportError surfaces as a
    # clearer message than "TracerProvider not found" because the OTel
    # extras are an optional install (``pip install -e ".[otel]"``).
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError as exc:
        log.warning(
            "otel_disabled_missing_deps",
            error=str(exc),
            hint="install with: pip install -e '.[otel]'",
        )
        return

    provider = TracerProvider()
    endpoint = settings.otel_exporter_otlp_endpoint
    exporter = (
        OTLPSpanExporter(endpoint=endpoint, insecure=True)
        if endpoint
        else OTLPSpanExporter(insecure=True)
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    if engine is not None:
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
    RedisInstrumentor().instrument()

    log.info("otel_initialised", endpoint=endpoint or "<default>")
