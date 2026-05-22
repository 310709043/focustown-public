from __future__ import annotations

from collections import OrderedDict, defaultdict

from fastapi import WebSocket

from app.core.logging import get_logger
from app.core.metrics import pubsub_duplicate_dropped_total

log = get_logger(__name__)

# Per-user LRU window. 50 is plenty for the only realistic duplicate
# source — a flaky reconnect where the previous process keeps a stale
# socket open for a few seconds — and keeps the worst-case memory
# bounded at O(users * 50 * msg_id length).
_DEDUP_WINDOW = 50


class WSManager:
    """In-process registry of active WebSocket connections, keyed by user_id.

    The cross-process fan-out is handled separately by RedisPubSubPublisher;
    this manager is only responsible for delivering payloads to sockets that
    happen to be connected to THIS FastAPI process.

    Per-user LRU dedup on ``deliver()``: if the same ``msg_id`` arrives
    twice in the recent window (e.g. because the user has sockets on
    two API processes during a flaky reconnect), the second delivery is
    silently skipped.
    """

    def __init__(self) -> None:
        self._conns: dict[str, set[WebSocket]] = defaultdict(set)
        self._seen: dict[str, OrderedDict[str, None]] = {}

    async def connect(self, user_id: str, ws: WebSocket, subprotocol: str | None = None) -> None:
        # When the client offered Sec-WebSocket-Protocol: bearer.{token},
        # echo it back on accept — browsers reject the handshake otherwise.
        await ws.accept(subprotocol=subprotocol)
        self._conns[user_id].add(ws)
        log.info("ws_connected", user_id=user_id, count=len(self._conns[user_id]))

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        self._conns[user_id].discard(ws)
        if not self._conns[user_id]:
            self._conns.pop(user_id, None)
            # Drop the dedup window with the user — no more sockets means
            # no risk of a duplicate from a still-open peer.
            self._seen.pop(user_id, None)
        log.info("ws_disconnected", user_id=user_id)

    def _seen_before(self, user_id: str, msg_id: str | None) -> bool:
        if not msg_id:
            return False
        window = self._seen.setdefault(user_id, OrderedDict())
        if msg_id in window:
            window.move_to_end(msg_id)
            return True
        window[msg_id] = None
        if len(window) > _DEDUP_WINDOW:
            window.popitem(last=False)
        return False

    async def deliver(self, user_id: str, payload: dict) -> int:
        """Send payload to all sockets owned by user_id on THIS process.

        If ``payload`` carries a ``msg_id`` already seen for this user in
        the recent window, the call is a silent no-op (returns 0).
        """
        if self._seen_before(user_id, payload.get("msg_id")):
            pubsub_duplicate_dropped_total.labels(channel=f"user:{user_id}").inc()
            return 0
        sockets = list(self._conns.get(user_id, ()))
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._conns[user_id].discard(ws)
        return len(sockets) - len(dead)

    def has_local(self, user_id: str) -> bool:
        return user_id in self._conns
