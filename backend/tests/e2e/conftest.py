"""E2E fixtures piggyback on integration fixtures + add event subscribers.

pytest only discovers conftest.py files at-or-above the test file's
directory, so we explicitly re-export the integration fixtures here.
"""
from __future__ import annotations

from tests.integration.conftest import (  # noqa: F401
    _postgres_container,
    _redis_container,
    app,
    auth_headers,
    authed_user,
    client,
    db_engine,
    db_session,
    flushed_redis,
    integration_env,
)
from tests.integration.conftest_e2e import coin_award_registered  # noqa: F401
