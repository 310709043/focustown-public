from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.v1.presence.schemas import StreetUserResponse, VehicleViewResponse
from app.core.deps import (
    ClientIpDep,
    CurrentUserId,
    DbDep,
    PresenceTrackerDep,
    RateLimiterDep,
    RealtimePublisherDep,
    SettingsDep,
)
from app.core.exceptions import RateLimitedError
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.services.presence_service import PresenceService
from app.infrastructure.db.repositories import SqlShopRepo, SqlUserRepo

router = APIRouter()


def _service(tracker, publisher: IRealtimePublisher) -> PresenceService:
    return PresenceService(
        tracker=tracker,
        publisher=publisher,
    )


@router.get("/street", response_model=list[StreetUserResponse])
async def list_street(
    _: CurrentUserId,
    db: DbDep,
    tracker: PresenceTrackerDep,
    publisher: RealtimePublisherDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
    cap: int = Query(200, ge=1, le=500),
) -> list[StreetUserResponse]:
    # Town view polls this every few seconds; 60/min is ~1 req/sec headroom
    # while still rejecting scraper-style traffic.
    decision = await limiter.hit(
        f"presence:ip:{client_ip or 'unknown'}",
        limit=settings.read_rl_presence_per_ip_per_min,
        window_seconds=60,
    )
    if not decision.allowed:
        raise RateLimitedError("rate_limited")
    svc = _service(tracker, publisher)
    users = await svc.list_street(SqlUserRepo(db), SqlShopRepo(db), cap=cap)
    return [
        StreetUserResponse(
            id=u.id,
            display_name=u.display_name,
            character_key=u.character_key,
            status=u.status,
            activity=u.activity,
            is_bot=u.is_bot,
            vehicle=(
                VehicleViewResponse(
                    icon=u.vehicle.icon,
                    body_color=u.vehicle.body_color,
                    roof_color=u.vehicle.roof_color,
                )
                if u.vehicle is not None
                else None
            ),
        )
        for u in users
    ]
