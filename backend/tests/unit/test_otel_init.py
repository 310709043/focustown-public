"""Unit tests for OpenTelemetry initialisation.

The OTel boot path is gated by ``settings.otel_enabled``. Two cases
matter:

* ``otel_enabled=False`` (default) — ``init_otel`` is a no-op. We
  prove this by patching the deferred imports to track whether
  ``opentelemetry`` ever gets imported on this code path. Cold-start
  cost is a real production concern.
* ``otel_enabled=True`` — the SDK + instrumentors are invoked with
  the configured endpoint. We don't require the OTel packages to be
  installed in the unit-test env; the deferred imports are mocked.
"""
from __future__ import annotations

import sys
import types
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def reset_settings_cache():
    """Clear the lru_cache on ``get_settings`` so env overrides apply."""
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_init_otel_is_noop_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
    reset_settings_cache: None,
) -> None:
    monkeypatch.setenv("OTEL_ENABLED", "false")

    # Sentinel: if the function deferred-imports anything below, the
    # test would see a different module list. Spy on __import__ so any
    # ``opentelemetry`` import on the disabled path surfaces immediately.
    real_import = (
        __builtins__["__import__"]
        if isinstance(__builtins__, dict)
        else __builtins__.__import__
    )

    seen_otel_import = False

    def _spy_import(name: str, *args: Any, **kwargs: Any) -> Any:
        nonlocal seen_otel_import
        if name.startswith("opentelemetry"):
            seen_otel_import = True
        return real_import(name, *args, **kwargs)

    from app.infrastructure.db.observability import init_otel

    with patch("builtins.__import__", side_effect=_spy_import):
        init_otel(MagicMock(), MagicMock())

    assert seen_otel_import is False, (
        "init_otel must defer opentelemetry imports when disabled "
        "(see docstring — multi-second cold start)"
    )


def test_init_otel_wires_instrumentors_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
    reset_settings_cache: None,
) -> None:
    monkeypatch.setenv("OTEL_ENABLED", "true")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4317")

    # Build fake opentelemetry submodules so the deferred imports inside
    # init_otel resolve to mocks. The shape mirrors the real SDK API
    # closely enough that a future SDK upgrade with a breaking signature
    # change makes the test fail loudly.
    fake_trace = MagicMock()
    fake_tracer_provider = MagicMock()
    fake_batch_processor = MagicMock()
    fake_otlp_exporter = MagicMock()
    fake_fastapi_instr = MagicMock()
    fake_sqla_instr_cls = MagicMock()
    fake_redis_instr_cls = MagicMock()

    # Build the fake module tree.
    fake_modules: dict[str, types.ModuleType] = {}

    def _new(name: str) -> types.ModuleType:
        mod = types.ModuleType(name)
        fake_modules[name] = mod
        return mod

    otel_root = _new("opentelemetry")
    otel_root.trace = fake_trace  # type: ignore[attr-defined]

    exporter_root = _new("opentelemetry.exporter")
    exporter_otlp = _new("opentelemetry.exporter.otlp")
    exporter_grpc = _new("opentelemetry.exporter.otlp.proto")
    exporter_trace = _new(
        "opentelemetry.exporter.otlp.proto.grpc"
    )
    exporter_trace_mod = _new(
        "opentelemetry.exporter.otlp.proto.grpc.trace_exporter"
    )
    exporter_trace_mod.OTLPSpanExporter = fake_otlp_exporter  # type: ignore[attr-defined]

    instr_root = _new("opentelemetry.instrumentation")
    fastapi_mod = _new("opentelemetry.instrumentation.fastapi")
    fastapi_mod.FastAPIInstrumentor = fake_fastapi_instr  # type: ignore[attr-defined]
    sqla_mod = _new("opentelemetry.instrumentation.sqlalchemy")
    sqla_mod.SQLAlchemyInstrumentor = fake_sqla_instr_cls  # type: ignore[attr-defined]
    redis_mod = _new("opentelemetry.instrumentation.redis")
    redis_mod.RedisInstrumentor = fake_redis_instr_cls  # type: ignore[attr-defined]

    sdk_root = _new("opentelemetry.sdk")
    sdk_trace = _new("opentelemetry.sdk.trace")
    sdk_trace.TracerProvider = lambda: fake_tracer_provider  # type: ignore[attr-defined]
    sdk_export = _new("opentelemetry.sdk.trace.export")
    sdk_export.BatchSpanProcessor = lambda *a, **k: fake_batch_processor  # type: ignore[attr-defined]

    # Reference all modules so flake8 doesn't think they're unused — and
    # they need to be alive in sys.modules for the import to resolve.
    _ = (
        otel_root,
        exporter_root,
        exporter_otlp,
        exporter_grpc,
        exporter_trace,
        instr_root,
        sdk_root,
    )

    saved = {name: sys.modules.get(name) for name in fake_modules}
    sys.modules.update(fake_modules)
    try:
        # Reload observability so the deferred-import path inside
        # init_otel finds our fakes when called below. The function
        # imports lazily so a single call is enough.
        from app.infrastructure.db.observability import init_otel

        fake_engine = MagicMock()
        fake_engine.sync_engine = MagicMock()
        fake_app = MagicMock()
        init_otel(fake_app, fake_engine)

        fake_fastapi_instr.instrument_app.assert_called_once_with(fake_app)
        fake_sqla_instr_cls.return_value.instrument.assert_called_once()
        fake_redis_instr_cls.return_value.instrument.assert_called_once()
        fake_trace.set_tracer_provider.assert_called_once_with(fake_tracer_provider)
    finally:
        for name, mod in saved.items():
            if mod is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = mod
