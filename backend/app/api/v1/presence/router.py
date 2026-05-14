from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.v1.presence.schemas import StreetUserResponse, VehicleViewResponse
from app.core.deps import CurrentUserId, DbDep, PresenceTrackerDep
from app.domain.services.presence_service import PresenceService
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.repositories import SqlShopRepo, SqlUserRepo
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher

router = APIRouter()


def _service(tracker) -> PresenceService:
    return PresenceService(
        tracker=tracker,
        publisher=RedisPubSubPublisher(get_redis()),
    )


@router.get("/street", response_model=list[StreetUserResponse])
async def list_street(
    _: CurrentUserId,
    db: DbDep,
    tracker: PresenceTrackerDep,
    cap: int = Query(12, ge=1, le=50),
) -> list[StreetUserResponse]:
    svc = _service(tracker)
    users = await svc.list_street(SqlUserRepo(db), SqlShopRepo(db), cap=cap)
    return [
        StreetUserResponse(
            id=u.id,
            display_name=u.display_name,
            character_key=u.character_key,
            status=u.status,
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
