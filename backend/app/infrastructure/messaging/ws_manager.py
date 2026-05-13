from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket

from app.core.logging import get_logger

log = get_logger(__name__)


class WSManager:
    """In-process registry of active WebSocket connections, keyed by user_id.

    The cross-process fan-out is handled separately by RedisPubSubPublisher;
    this manager is only responsible for delivering payloads to sockets that
    happen to be connected to THIS FastAPI process.
    """

    def __init__(self) -> None:
        self._conns: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._conns[user_id].add(ws)
        log.info("ws_connected", user_id=user_id, count=len(self._conns[user_id]))

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        self._conns[user_id].discard(ws)
        if not self._conns[user_id]:
            self._conns.pop(user_id, None)
        log.info("ws_disconnected", user_id=user_id)

    async def deliver(self, user_id: str, payload: dict) -> int:
        """Send payload to all sockets owned by user_id on THIS process."""
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
