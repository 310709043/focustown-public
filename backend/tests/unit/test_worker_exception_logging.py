"""Unit tests for the worker's `_log_job_errors` exception wrapper.

Why this matters
----------------
APScheduler catches job exceptions and dispatches them to its own listener
chain — by default a stdlib logger that doesn't go through structlog, so
operators tailing JSON logs in CloudWatch never see the traceback. The
wrapper is the only thing guaranteeing each failure is on the same log
stream with `worker_job_failed` + job context.
"""
from __future__ import annotations

import pytest
import structlog

from app import worker


@pytest.mark.asyncio
async def test_wrapper_logs_exception_and_reraises() -> None:
    async def boom() -> None:
        raise RuntimeError("kaboom")

    wrapped = worker._log_job_errors("sweep_abandoned", boom)

    with structlog.testing.capture_logs() as captured:
        with pytest.raises(RuntimeError, match="kaboom"):
            await wrapped()

    failures = [e for e in captured if e["event"] == "worker_job_failed"]
    assert len(failures) == 1
    assert failures[0]["job"] == "sweep_abandoned"
    assert failures[0]["log_level"] == "error"


@pytest.mark.asyncio
async def test_wrapper_passes_through_on_success() -> None:
    calls: list[int] = []

    async def ok() -> None:
        calls.append(1)

    wrapped = worker._log_job_errors("snapshot_leaderboard", ok)

    with structlog.testing.capture_logs() as captured:
        await wrapped()

    assert calls == [1]
    assert [e for e in captured if e["event"] == "worker_job_failed"] == []


@pytest.mark.asyncio
async def test_wrapper_clears_contextvars_after_run() -> None:
    async def ok() -> None:
        pass

    wrapped = worker._log_job_errors("refresh_bot_presence", ok)
    await wrapped()

    assert structlog.contextvars.get_contextvars() == {}
