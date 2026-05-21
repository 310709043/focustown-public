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

    Only the methods WSManager touches: ``accept(subprotocol=...)`` and
    ``send_json(payload)``. ``raise_on_send`` lets a single test simulate
    a socket whose peer hung up between deliver attempts.
    """

    def __init__(self, raise_on_send: bool = False) -> None:
        self.sent: list[dict[str, Any]] = []
        self.accepted_with: str | None | object = object()
        self.raise_on_send = raise_on_send

    async def accept(self, subprotocol: str | None = None) -> None:
        self.accepted_with = subprotocol

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
async def test_connect_echoes_subprotocol_back_on_accept() -> None:
    mgr = WSManager()
    ws = FakeWebSocket()

    await mgr.connect("alice", ws, subprotocol="bearer.tkn")

    # Echoing the subprotocol is what makes the browser accept the
    # Sec-WebSocket-Protocol: bearer.{token} handshake.
    assert ws.accepted_with == "bearer.tkn"


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
