from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.deps import AuthProviderDep, PresenceTrackerDep, WSManagerDep
from app.core.exceptions import AuthError
from app.core.logging import get_logger
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.services.presence_service import STREET_CHANNEL, PresenceService
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher

log = get_logger(__name__)
router = APIRouter()


@router.websocket("/connect")
async def ws_connect(
    websocket: WebSocket,
    ws_mgr: WSManagerDep,
    auth: AuthProviderDep,
    tracker: PresenceTrackerDep,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """Single multiplexed connection per user. Messages are JSON envelopes:

    Inbound:
      {"type": "chat", "room_id": "...", "text": "..."}
      {"type": "presence", "status": "focusing"}
    Outbound:
      {"type": "chat", "room_id": "...", "from": "...", "text": "...", "ts": ...}
      {"type": "presence.changed", "user_id": "...", "state": "...", "status": "..."}
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
    presence = PresenceService(tracker=tracker, publisher=pub)

    async def _on_message(channel: str, payload: dict) -> None:
        # Bridge from Redis fan-out into this user's local socket(s).
        if channel == IRealtimePublisher.user_channel(user_id):
            await ws_mgr.deliver(user_id, payload)
        elif channel.startswith("room:"):
            await ws_mgr.deliver(user_id, payload)
        elif channel == STREET_CHANNEL:
            await ws_mgr.deliver(user_id, payload)

    await pub.start(
        handler=_on_message,
        channels=[IRealtimePublisher.user_channel(user_id), STREET_CHANNEL],
    )
    await presence.connect(user_id)

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
                status = (data.get("status") or "focus").strip() or "focus"
                await presence.set_status(user_id, status)
            else:
                log.debug("ws_unknown_message", kind=kind)
    except WebSocketDisconnect:
        pass
    finally:
        ws_mgr.disconnect(user_id, websocket)
        # Only mark offline when this process has no remaining sockets for
        # the user (multi-tab safety). Cross-process refcounting is deferred
        # until horizontal scaling actually happens.
        if not ws_mgr.has_local(user_id):
            try:
                await presence.disconnect(user_id)
            except Exception:
                log.exception("presence_disconnect_failed", user_id=user_id)
        await pub.stop()
