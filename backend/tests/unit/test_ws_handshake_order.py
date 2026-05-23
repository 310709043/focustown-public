"""Unit tests for the WebSocket handshake-order contract.

Regression: when ``websocket.close(code=4401)`` is called BEFORE
``websocket.accept(...)``, Starlette responds with HTTP 403 instead of a
WS close frame. The frontend client's "4401 → refresh token → reconnect"
flow then never fires because the browser sees a generic connection
failure with no close code, and the page loops the same bad token.

These tests pin the contract: ``accept`` must always be called first;
``close`` only ever runs after the handshake has been completed so the
code reaches the client as a proper WS close frame.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.api.v1.ws.router import ws_connect
from app.core.exceptions import AuthError
from app.domain.rate_limit import IRateLimiter, RateLimitDecision
from app.infrastructure.messaging.ws_manager import WSManager


class RecordingWebSocket:
    """Minimal WebSocket double recording accept/close call order."""

    def __init__(self, *, subprotocols: list[str] | None = None) -> None:
        self.scope: dict[str, Any] = {"subprotocols": subprotocols or []}
        self.client = type("C", (), {"host": "1.2.3.4"})()
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def accept(self, subprotocol: str | None = None) -> None:
        self.calls.append(("accept", {"subprotocol": subprotocol}))

    async def close(self, code: int) -> None:
        self.calls.append(("close", {"code": code}))


class AllowingLimiter(IRateLimiter):
    async def hit(
        self, key: str, *, limit: int, window_seconds: int
    ) -> RateLimitDecision:
        return RateLimitDecision(allowed=True, remaining=limit - 1, retry_after_seconds=0)


class RejectingLimiter(IRateLimiter):
    async def hit(
        self, key: str, *, limit: int, window_seconds: int
    ) -> RateLimitDecision:
        return RateLimitDecision(allowed=False, remaining=0, retry_after_seconds=60)


class FailingAuth:
    async def verify_access_token(self, token: str) -> Any:
        raise AuthError("bad token")


class _Settings:
    ws_rl_connect_per_ip_per_min = 100


@pytest.mark.asyncio
async def test_missing_token_accepts_then_closes_with_4401() -> None:
    """Caller sends no bearer subprotocol and no ?token=. The router must
    accept the handshake first, then send a 4401 close — never an
    unaccepted close (which would surface as HTTP 403)."""
    ws = RecordingWebSocket(subprotocols=[])
    await ws_connect(
        websocket=ws,  # type: ignore[arg-type]
        ws_mgr=WSManager(),
        auth=FailingAuth(),  # type: ignore[arg-type]
        tracker=None,  # type: ignore[arg-type]  # untouched on this path
        settings=_Settings(),  # type: ignore[arg-type]
        limiter=AllowingLimiter(),
        match_queue=None,  # type: ignore[arg-type]  # untouched on this path
        token=None,
    )
    kinds = [c[0] for c in ws.calls]
    assert kinds == ["accept", "close"], (
        f"accept must precede close, got {ws.calls!r}"
    )
    assert ws.calls[-1][1]["code"] == 4401


@pytest.mark.asyncio
async def test_invalid_token_accepts_then_closes_with_4401() -> None:
    ws = RecordingWebSocket(subprotocols=["bearer.garbage"])
    await ws_connect(
        websocket=ws,  # type: ignore[arg-type]
        ws_mgr=WSManager(),
        auth=FailingAuth(),  # type: ignore[arg-type]
        tracker=None,  # type: ignore[arg-type]
        settings=_Settings(),  # type: ignore[arg-type]
        limiter=AllowingLimiter(),
        match_queue=None,  # type: ignore[arg-type]
        token=None,
    )
    kinds = [c[0] for c in ws.calls]
    assert kinds == ["accept", "close"]
    assert ws.calls[0][1]["subprotocol"] == "bearer.garbage", (
        "subprotocol must echo back at accept time"
    )
    assert ws.calls[-1][1]["code"] == 4401


@pytest.mark.asyncio
async def test_rate_limit_rejection_accepts_then_closes_with_4429() -> None:
    ws = RecordingWebSocket()
    await ws_connect(
        websocket=ws,  # type: ignore[arg-type]
        ws_mgr=WSManager(),
        auth=FailingAuth(),  # type: ignore[arg-type]
        tracker=None,  # type: ignore[arg-type]
        settings=_Settings(),  # type: ignore[arg-type]
        limiter=RejectingLimiter(),
        match_queue=None,  # type: ignore[arg-type]
        token=None,
    )
    kinds = [c[0] for c in ws.calls]
    assert kinds == ["accept", "close"]
    assert ws.calls[-1][1]["code"] == 4429
