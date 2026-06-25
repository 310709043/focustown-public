from __future__ import annotations

import os

import pytest

# Ensure tests have a deterministic secret without requiring a .env file.
os.environ.setdefault("APP_SECRET_KEY", "test-secret-key-for-pytest-only-32chars!")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://lowbatterytown:lowbatterytown@localhost/lowbatterytown_test",
)
os.environ.setdefault("APP_ENV", "test")
# AudioTokenService refuses to issue when this is blank — set a stable
# dev secret so /play-token integration tests don't 500.
os.environ.setdefault(
    "AUDIO_PROXY_SECRET", "test-audio-secret-please-rotate-32chars"
)


@pytest.fixture(autouse=True)
def _isolate_event_bus():
    """Snapshot + restore the process-global ``_event_bus`` around every test.

    ``app.core.deps._event_bus`` is a module-level singleton, and the app
    lifespan registers subscribers (CoinAwardService, SessionPresenceLink,
    ...) onto it with no teardown. Tests that run the real lifespan —
    notably the middleware tests, which patch ``get_redis`` to return
    ``None`` — leak a ``SessionPresenceLink`` whose presence tracker holds a
    ``None`` Redis client. Later e2e tests then fire SessionStarted /
    SessionCompleted and the leaked handler blows up with
    ``'NoneType' object has no attribute 'pipeline'`` (swallowed by the
    bus, but it pollutes logs and breaks isolation).

    Restoring the handler map per test contains any such leak to the test
    that created it.
    """
    from app.core.deps import _event_bus

    snapshot = {etype: list(handlers) for etype, handlers in _event_bus._handlers.items()}
    try:
        yield
    finally:
        _event_bus._handlers.clear()
        for etype, handlers in snapshot.items():
            _event_bus._handlers[etype].extend(handlers)
