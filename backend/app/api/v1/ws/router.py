from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.deps import (
    AuthProviderDep,
    MatchingQueueDep,
    PresenceTrackerDep,
    RateLimiterDep,
    SettingsDep,
    WSManagerDep,
)
from app.core.exceptions import AuthError
from app.core.logging import get_logger
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.services.presence_service import STREET_CHANNEL, PresenceService
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.repositories.match_repo import SqlMatchRepo
from app.infrastructure.db.repositories.room_repo import SqlRoomRepo
from app.infrastructure.db.repositories.room_visit_repo import SqlRoomVisitRepo
from app.infrastructure.db.session import get_session_factory
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher

log = get_logger(__name__)
router = APIRouter()

_BEARER_PREFIX = "bearer."

# Server-side bound on chat payloads. Frontend already truncates user input
# at the textarea, but a hostile client could send a megabyte string and
# trigger a fan-out of that size to every other socket on the room channel.
# 2000 chars covers any sane Buddy chat line.
_CHAT_TEXT_MAX_CHARS = 2000


async def _is_room_subscriber(
    *, database_url: str, user_id: str, room_id: str
) -> bool:
    """Membership gate for `join` and `chat`. Returns True iff:
       - the user owns the room, OR
       - the room is `public` and the user is authenticated (any user), OR
       - the room is `invite_only` and the user has an active visit row.

    Uses a fresh session per call so the long-lived WS connection doesn't
    hold a transaction open. Cost: 1-2 SELECTs per chat / join message.
    """
    factory = get_session_factory(database_url)
    async with factory() as session:
        room = await SqlRoomRepo(session).get_by_id(room_id)
        if room is None:
            return False
        if room.owner_user_id == user_id:
            return True
        if room.visibility == "public":
            return True
        visit = await SqlRoomVisitRepo(session).get_by_user(user_id)
        return visit is not None and visit.room_id == room_id


async def _is_match_member(
    *, database_url: str, user_id: str, match_id: str
) -> bool:
    """Membership gate for pair-station subscribe.

    Returns True iff the user is either side of an accepted match. Fresh
    per-call session for the same reason ``_is_room_subscriber`` uses one.
    """
    factory = get_session_factory(database_url)
    async with factory() as session:
        match = await SqlMatchRepo(session).get(match_id)
        if match is None:
            return False
        if match.status != "accepted":
            return False
        return user_id in (match.requester_id, match.candidate_id)


def extract_ws_token(
    subprotocols: list[str], query_token: str | None
) -> tuple[str | None, str | None, bool]:
    """Decide how to authenticate a WS handshake.

    Returns ``(token, chosen_subprotocol, used_query_fallback)``:
      - ``token`` — the JWT to verify, or ``None`` if no credential was offered
      - ``chosen_subprotocol`` — value to echo back via ``ws.accept(subprotocol=...)``
        when the client used the subprotocol path; ``None`` otherwise
      - ``used_query_fallback`` — ``True`` only when the client fell back to
        ``?token=...``; routers log a deprecation in that case

    Extracted as a pure function so the branching can be unit-tested without
    spinning up the full WS handshake harness.
    """
    bearer = next((p for p in subprotocols if p.startswith(_BEARER_PREFIX)), None)
    if bearer is not None:
        return bearer[len(_BEARER_PREFIX) :], bearer, False
    if query_token:
        return query_token, None, True
    return None, None, False


@router.websocket("/connect")
async def ws_connect(
    websocket: WebSocket,
    ws_mgr: WSManagerDep,
    auth: AuthProviderDep,
    tracker: PresenceTrackerDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    match_queue: MatchingQueueDep,
    token: str | None = Query(
        None,
        max_length=2048,
        description="DEPRECATED — use Sec-WebSocket-Protocol: bearer.{token}",
    ),
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
    # Per-IP connect throttle BEFORE the JWT decode. Attackers probing tokens
    # otherwise pay only the JWT-verify cost; rejecting at the handshake stage
    # bounds both CPU and the auth-failure log volume. Close code 4429 mirrors
    # the HTTP 429 convention for WebSocket clients.
    peer_ip = websocket.client.host if websocket.client else None
    decision = await limiter.hit(
        f"ws:ip:{peer_ip or 'unknown'}",
        limit=settings.ws_rl_connect_per_ip_per_min,
        window_seconds=60,
    )
    if not decision.allowed:
        await websocket.close(code=4429)
        return

    # Prefer Sec-WebSocket-Protocol: bearer.{token} so the JWT stays out of
    # proxy access logs. Keep ?token=... as a transitional fallback with a
    # deprecation log so the next release can drop it.
    subprotocols = websocket.scope.get("subprotocols") or []
    token, chosen_subprotocol, used_query = extract_ws_token(subprotocols, token)
    if used_query:
        log.warning("ws_auth_query_param_deprecated")

    if not token:
        await websocket.close(code=4401)
        return

    try:
        principal = await auth.verify_access_token(token)
    except AuthError:
        await websocket.close(code=4401)
        return

    user_id = principal.user_id
    await ws_mgr.connect(user_id, websocket, subprotocol=chosen_subprotocol)
    pub = RedisPubSubPublisher(get_redis())
    presence = PresenceService(tracker=tracker, publisher=pub)

    async def _on_message(channel: str, payload: dict) -> None:
        # Bridge from Redis fan-out into this user's local socket(s).
        if channel == IRealtimePublisher.user_channel(user_id):
            await ws_mgr.deliver(user_id, payload)
        elif channel.startswith("room:"):
            await ws_mgr.deliver(user_id, payload)
        elif channel.startswith("station:"):
            await ws_mgr.deliver(user_id, payload)
        elif channel == STREET_CHANNEL:
            await ws_mgr.deliver(user_id, payload)

    initial_channels = [
        IRealtimePublisher.user_channel(user_id),
        STREET_CHANNEL,
    ]
    if settings.feat_shared_station:
        # Auto-subscribe every WS to the single global city station. Cheap
        # (one extra SUBSCRIBE on connect); the frontend disconnect
        # preference is store-only and never unsubscribes — that's what
        # makes reconnect instant.
        initial_channels.append(
            IRealtimePublisher.station_channel("city", settings.default_city_id)
        )
    await pub.start(handler=_on_message, channels=initial_channels)
    await presence.connect(user_id)

    try:
        while True:
            data = await websocket.receive_json()
            kind = data.get("type")
            if kind == "chat":
                room_id = data.get("room_id")
                text = (data.get("text") or "").strip()[:_CHAT_TEXT_MAX_CHARS]
                if not room_id or not text:
                    continue
                # Per-user chat token bucket — prevents a single connection
                # from flooding every room. Key is per-user, not per-IP,
                # because legitimate clients NAT through shared egress.
                chat_decision = await limiter.hit(
                    f"ws:chat:user:{user_id}",
                    limit=settings.ws_rl_chat_per_user_per_min,
                    window_seconds=60,
                )
                if not chat_decision.allowed:
                    continue
                if not await _is_room_subscriber(
                    database_url=settings.database_url,
                    user_id=user_id,
                    room_id=room_id,
                ):
                    log.warning(
                        "ws_chat_membership_denied",
                        user_id=user_id,
                        room_id=room_id,
                    )
                    continue
                await pub.publish(
                    IRealtimePublisher.room_channel(room_id),
                    {"type": "chat", "room_id": room_id, "from": user_id, "text": text},
                )
            elif kind == "join":
                room_id = data.get("room_id")
                if not room_id:
                    continue
                if not await _is_room_subscriber(
                    database_url=settings.database_url,
                    user_id=user_id,
                    room_id=room_id,
                ):
                    log.warning(
                        "ws_join_membership_denied",
                        user_id=user_id,
                        room_id=room_id,
                    )
                    continue
                await pub.add_channels([IRealtimePublisher.room_channel(room_id)])
            elif kind == "presence":
                status = (data.get("status") or "focus").strip() or "focus"
                await presence.set_status(user_id, status)
            elif kind == "join_pair_station":
                # Pair-station subscribe. Separate from `join` because
                # match membership lives in ``matches``, not ``rooms``,
                # and the gate is different (member-of-match, not
                # owner/public/visit). Frontend sends this on entering
                # /focus/{matchId}.
                if not settings.feat_shared_station:
                    continue
                match_id = data.get("match_id")
                if not match_id:
                    continue
                if not await _is_match_member(
                    database_url=settings.database_url,
                    user_id=user_id,
                    match_id=match_id,
                ):
                    log.warning(
                        "ws_pair_station_membership_denied",
                        user_id=user_id,
                        match_id=match_id,
                    )
                    continue
                await pub.add_channels(
                    [IRealtimePublisher.station_channel("pair", match_id)]
                )
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
            # Same multi-tab guard for the matching queue: only drop the
            # waiter when their last socket goes away. Idempotent — no-ops
            # cheaply if the user wasn't waiting.
            try:
                await match_queue.cancel(user_id)
            except Exception:
                log.exception("matching_queue_cancel_failed", user_id=user_id)
        await pub.stop()
