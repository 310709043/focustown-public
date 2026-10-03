"""LowBatteryTown endpoints: anonymous guest session, town status, safety
reports, and the realtime socket that carries the whole chat flow.

Socket protocol (JSON envelopes)
--------------------------------
Inbound:
  {"type": "join", "profile": {"nickname", "energy", "preference"}, "adult": true}
  {"type": "cancel"} | {"type": "message", "text"} | {"type": "typing"}
  {"type": "extend"} | {"type": "leave"} | {"type": "heartbeat"}
Outbound (all ``lbt.*``):
  waiting, matched, message, typing, extend_requested, extended, ended, error
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, WebSocket, WebSocketDisconnect

from app.api.v1.lbt.schemas import (
    GuestSessionResponse,
    ReportCreate,
    ReportCreated,
    TownStatusResponse,
)
from app.api.v1.ws.router import extract_ws_token
from app.core.clock import IClock
from app.core.deps import (
    ClientIpDep,
    ClockDep,
    DbDep,
    IdGenDep,
    LbtConfigDep,
    LbtStoreDep,
    RateLimiterDep,
    SettingsDep,
    WSManagerDep,
)
from app.core.exceptions import AuthError, RateLimitedError, ValidationError
from app.core.ids import IIdGenerator
from app.core.logging import get_logger
from app.core.security import create_guest_token, decode_guest_token, new_guest_id
from app.domain.repositories.lbt import ILbtReportRepo, ILbtStore
from app.domain.services.lbt_rules import LbtInputError
from app.domain.services.lbt_service import LbtConfig, LbtService, guest_channel
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.repositories.lbt_report_repo import SqlLbtReportRepo
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher

log = get_logger(__name__)
router = APIRouter()


def _service(
    *,
    store: ILbtStore,
    config: LbtConfig,
    clock: IClock,
    ids: IIdGenerator,
    reports: ILbtReportRepo | None = None,
    publisher: RedisPubSubPublisher | None = None,
) -> LbtService:
    return LbtService(
        store=store,
        publisher=publisher or RedisPubSubPublisher(get_redis()),
        clock=clock,
        ids=ids,
        config=config,
        reports=reports,
    )


async def get_guest_id(
    settings: SettingsDep,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("missing_guest_token")
    return decode_guest_token(settings, authorization[7:].strip())


GuestIdDep = Annotated[str, Depends(get_guest_id)]


@router.post("/guest", response_model=GuestSessionResponse)
async def create_guest(
    settings: SettingsDep, limiter: RateLimiterDep, ip: ClientIpDep
) -> GuestSessionResponse:
    """Issue an anonymous guest identity. No personal data is collected."""
    decision = await limiter.hit(
        f"lbt:guest:ip:{ip or 'unknown'}",
        limit=settings.lbt_guest_per_ip_per_hour,
        window_seconds=3600,
    )
    if not decision.allowed:
        raise RateLimitedError("too_many_guest_sessions")
    guest_id = new_guest_id()
    token, expires_at = create_guest_token(settings, guest_id)
    return GuestSessionResponse(guest_id=guest_id, token=token, expires_at=expires_at)


@router.get("/status", response_model=TownStatusResponse)
async def town_status(
    store: LbtStoreDep, config: LbtConfigDep, clock: ClockDep, ids: IdGenDep
) -> TownStatusResponse:
    status = await _service(store=store, config=config, clock=clock, ids=ids).status()
    return TownStatusResponse(**status)


@router.post("/reports", response_model=ReportCreated, status_code=201)
async def create_report(
    body: ReportCreate,
    guest_id: GuestIdDep,
    db: DbDep,
    store: LbtStoreDep,
    config: LbtConfigDep,
    clock: ClockDep,
    ids: IdGenDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
) -> ReportCreated:
    decision = await limiter.hit(
        f"lbt:report:{guest_id}",
        limit=settings.lbt_report_per_guest_per_hour,
        window_seconds=3600,
    )
    if not decision.allowed:
        raise RateLimitedError("too_many_reports")
    service = _service(
        store=store, config=config, clock=clock, ids=ids, reports=SqlLbtReportRepo(db)
    )
    try:
        report_id = await service.report(guest_id, body.reason, body.note)
    except LbtInputError as exc:
        raise ValidationError(exc.code) from exc
    return ReportCreated(id=report_id)


@router.websocket("/ws")
async def lbt_socket(
    websocket: WebSocket,
    ws_mgr: WSManagerDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    store: LbtStoreDep,
    config: LbtConfigDep,
    clock: ClockDep,
    ids: IdGenDep,
    token: str | None = Query(None, max_length=2048),
) -> None:
    peer_ip = websocket.client.host if websocket.client else None
    subprotocols = websocket.scope.get("subprotocols") or []
    raw_token, chosen_subprotocol, _ = extract_ws_token(subprotocols, token)
    # Accept first so rejections arrive as WS close codes (see ws/router.py).
    await websocket.accept(subprotocol=chosen_subprotocol)

    decision = await limiter.hit(
        f"ws:ip:{peer_ip or 'unknown'}",
        limit=settings.ws_rl_connect_per_ip_per_min,
        window_seconds=60,
    )
    if not decision.allowed:
        await websocket.close(code=4429)
        return
    if not raw_token:
        await websocket.close(code=4401)
        return
    try:
        guest_id = decode_guest_token(settings, raw_token)
    except AuthError:
        await websocket.close(code=4401)
        return

    await ws_mgr.connect(guest_id, websocket)
    pub = RedisPubSubPublisher(get_redis())

    async def _on_message(channel: str, payload: dict) -> None:
        if channel == guest_channel(guest_id):
            await ws_mgr.deliver(guest_id, payload)

    await pub.start(handler=_on_message, channels=[guest_channel(guest_id)])
    service = _service(store=store, config=config, clock=clock, ids=ids, publisher=pub)
    await service.connect(guest_id)

    try:
        while True:
            try:
                data = await websocket.receive_json()
            except (ValueError, KeyError):
                continue
            if not isinstance(data, dict):
                continue
            kind = data.get("type")
            try:
                if kind == "heartbeat":
                    await service.heartbeat(guest_id)
                elif kind == "join":
                    profile = data.get("profile")
                    await service.join(
                        guest_id,
                        profile if isinstance(profile, dict) else {},
                        adult=data.get("adult") is True,
                    )
                elif kind == "cancel":
                    await service.cancel(guest_id)
                elif kind == "message":
                    allowed = await limiter.hit(
                        f"lbt:msg:{guest_id}",
                        limit=settings.lbt_msg_per_guest_per_min,
                        window_seconds=60,
                    )
                    if not allowed.allowed:
                        raise LbtInputError("slow_down")
                    await service.send_message(guest_id, data.get("text"))
                elif kind == "typing":
                    await service.typing(guest_id)
                elif kind == "extend":
                    await service.extend(guest_id)
                elif kind == "leave":
                    await service.leave(guest_id)
                else:
                    log.debug("lbt_ws_unknown_message", kind=kind)
            except LbtInputError as exc:
                await ws_mgr.deliver(guest_id, {"type": "lbt.error", "code": exc.code})
    except WebSocketDisconnect:
        pass
    finally:
        ws_mgr.disconnect(guest_id, websocket)
        if not ws_mgr.has_local(guest_id):
            try:
                await service.disconnect(guest_id)
            except Exception:
                log.exception("lbt_disconnect_failed")
        await pub.stop()
