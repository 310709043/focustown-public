from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.deps import AuthProviderDep, WSManagerDep
from app.core.exceptions import AuthError
from app.core.logging import get_logger
from app.domain.repositories.realtime import IRealtimePublisher
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher

log = get_logger(__name__)
router = APIRouter()


@router.websocket("/connect")
async def ws_connect(
    websocket: WebSocket,
    ws_mgr: WSManagerDep,
    auth: AuthProviderDep,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """Single multiplexed connection per user. Messages are JSON envelopes:

    Inbound:
      {"type": "chat", "room_id": "...", "text": "..."}
      {"type": "presence", "status": "focusing"}
    Outbound:
      {"type": "chat", "room_id": "...", "from": "...", "text": "...", "ts": ...}
      {"type": "match.proposed", ...}
      {"type": "session.completed", ...}
    """
    try:
        principal = await auth.verify_access_token(token)
    except AuthError:
        await websocket.close(code=4401)
        return

    user_id = principal.user_id
    await ws_mgr.connect(user_id, websocket)
    pub = RedisPubSubPublisher(get_redis())

    async def _on_message(channel: str, payload: dict) -> None:
        # Bridge from Redis fan-out into this user's local socket(s).
        if channel == IRealtimePublisher.user_channel(user_id):
            await ws_mgr.deliver(user_id, payload)
        elif channel.startswith("room:"):
            await ws_mgr.deliver(user_id, payload)

    await pub.start(handler=_on_message, channels=[IRealtimePublisher.user_channel(user_id)])

    try:
        while True:
            data = await websocket.receive_json()
            kind = data.get("type")
            if kind == "chat":
                room_id = data.get("room_id")
                text = (data.get("text") or "").strip()
                if not room_id or not text:
                    continue
                await pub.publish(
                    IRealtimePublisher.room_channel(room_id),
                    {"type": "chat", "room_id": room_id, "from": user_id, "text": text},
                )
            elif kind == "join":
                room_id = data.get("room_id")
                if room_id:
                    await pub.add_channels([IRealtimePublisher.room_channel(room_id)])
            elif kind == "presence":
                await pub.publish(
                    "presence", {"type": "presence", "user_id": user_id, "status": data.get("status")}
                )
            else:
                log.debug("ws_unknown_message", kind=kind)
    except WebSocketDisconnect:
        pass
    finally:
        ws_mgr.disconnect(user_id, websocket)
        await pub.stop()
