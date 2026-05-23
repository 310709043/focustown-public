"""Unit tests for ``WSManager``.

The four-category checklist:

- **logic**: connect adds the socket; disconnect removes it.
- **boundary**: multi-tab — second connect for the same user keeps the
  first socket alive; deliver fans to all live sockets.
- **error**: a socket whose ``send_json`` raises is removed from the
  registry instead of poisoning subsequent deliver calls.
- **object-state**: ``has_local`` returns True iff at least one socket
  remains; the user key disappears from the registry after the last
  socket disconnects.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.infrastructure.messaging.ws_manager import WSManager


class FakeWebSocket:
    """Duck-typed WebSocket — identity-hashable so it can go in a ``set``.

    Only the method WSManager touches: ``send_json(payload)``. ``accept``
    lives on the router now (handshake-order regression: see
    ``test_ws_handshake_order``); ``accept_called`` tracks whether
    WSManager accidentally invokes it. ``raise_on_send`` lets a single
    test simulate a socket whose peer hung up between deliver attempts.
    """

    def __init__(self, raise_on_send: bool = False) -> None:
        self.sent: list[dict[str, Any]] = []
        self.accept_called = False
        self.raise_on_send = raise_on_send

    async def accept(self, subprotocol: str | None = None) -> None:
        self.accept_called = True

    async def send_json(self, payload: dict[str, Any]) -> None:
        if self.raise_on_send:
            raise ConnectionError("peer hung up")
        self.sent.append(payload)


# ── logic ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_connect_registers_socket_under_user_id() -> None:
    mgr = WSManager()
    ws = FakeWebSocket()

    await mgr.connect("alice", ws)

    assert mgr.has_local("alice")


@pytest.mark.asyncio
async def test_connect_does_not_call_accept_router_owns_handshake() -> None:
    """``ws.accept`` moved to the router so close codes for pre-auth
    rejections (4401 / 4429) reach the client as proper WS close frames
    instead of HTTP 403. WSManager must NOT re-accept the same socket —
    Starlette raises if accept() runs twice."""
    mgr = WSManager()
    ws = FakeWebSocket()

    await mgr.connect("alice", ws)

    assert ws.accept_called is False


@pytest.mark.asyncio
async def test_disconnect_removes_socket() -> None:
    mgr = WSManager()
    ws = FakeWebSocket()
    await mgr.connect("alice", ws)

    mgr.disconnect("alice", ws)

    assert not mgr.has_local("alice")


# ── boundary ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_multi_tab_keeps_other_sockets_alive_on_one_disconnect() -> None:
    mgr = WSManager()
    tab_a, tab_b = FakeWebSocket(), FakeWebSocket()
    await mgr.connect("alice", tab_a)
    await mgr.connect("alice", tab_b)

    mgr.disconnect("alice", tab_a)

    # The other tab still has the user online.
    assert mgr.has_local("alice")


@pytest.mark.asyncio
async def test_deliver_fans_to_every_connected_socket_for_user() -> None:
    mgr = WSManager()
    tab_a, tab_b = FakeWebSocket(), FakeWebSocket()
    await mgr.connect("alice", tab_a)
    await mgr.connect("alice", tab_b)

    delivered = await mgr.deliver("alice", {"type": "ping"})

    assert delivered == 2
    assert tab_a.sent == [{"type": "ping"}]
    assert tab_b.sent == [{"type": "ping"}]


@pytest.mark.asyncio
async def test_deliver_to_unknown_user_is_a_noop() -> None:
    mgr = WSManager()

    delivered = await mgr.deliver("stranger", {"type": "ping"})

    assert delivered == 0


# ── error ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_deliver_drops_dead_sockets_so_next_deliver_isnt_poisoned() -> None:
    mgr = WSManager()
    live, dead = FakeWebSocket(), FakeWebSocket(raise_on_send=True)
    await mgr.connect("alice", live)
    await mgr.connect("alice", dead)

    first = await mgr.deliver("alice", {"type": "ping"})
    second = await mgr.deliver("alice", {"type": "ping"})

    # First call: 2 attempts, 1 delivery (dead raised). Manager removed the
    # dead one. Second call: only the live one remains, so 1 delivery.
    assert first == 1
    assert second == 1


# ── object-state ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_last_disconnect_pops_user_from_registry() -> None:
    mgr = WSManager()
    ws = FakeWebSocket()
    await mgr.connect("alice", ws)
    assert mgr.has_local("alice")

    mgr.disconnect("alice", ws)

    # User key removed entirely — so memory doesn't leak per-user
    # singletons after long-running connections close.
    assert "alice" not in mgr._conns


# ── msg_id dedup — multi-process safety ────────────────────────────────────


@pytest.mark.asyncio
async def test_deliver_drops_repeated_msg_id_for_same_user() -> None:
    """A user with sockets on two API processes during a flaky reconnect
    can receive the same Redis pub/sub frame twice. The LRU window in
    WSManager catches the repeat so the client sees it exactly once."""
    mgr = WSManager()
    ws = FakeWebSocket()
    await mgr.connect("alice", ws)

    payload = {"msg_id": "abc123", "type": "match.proposed"}
    first = await mgr.deliver("alice", payload)
    second = await mgr.deliver("alice", payload)

    assert first == 1
    assert second == 0
    assert ws.sent == [payload]


@pytest.mark.asyncio
async def test_deliver_without_msg_id_is_not_deduped() -> None:
    """Payloads minted before Phase 05 (or domain events that opt out of
    msg_id) must still deliver every time — otherwise the LRU would
    silently drop legitimate retries."""
    mgr = WSManager()
    ws = FakeWebSocket()
    await mgr.connect("alice", ws)

    payload = {"type": "ping"}  # no msg_id
    first = await mgr.deliver("alice", payload)
    second = await mgr.deliver("alice", payload)

    assert first == 1
    assert second == 1
    assert ws.sent == [payload, payload]


@pytest.mark.asyncio
async def test_disconnect_clears_dedup_window_for_user() -> None:
    """Once the user has no sockets, the LRU window is dropped so
    long-disconnected users don't keep their msg_ids resident forever."""
    mgr = WSManager()
    ws = FakeWebSocket()
    await mgr.connect("alice", ws)

    await mgr.deliver("alice", {"msg_id": "m-1", "type": "ping"})
    assert "alice" in mgr._seen
    mgr.disconnect("alice", ws)
    assert "alice" not in mgr._seen
