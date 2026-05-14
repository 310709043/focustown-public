from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.v1.presence.schemas import StreetUserResponse, VehicleViewResponse
from app.core.deps import (
    CurrentUserId,
    DbDep,
    PresenceTrackerDep,
    RealtimePublisherDep,
)
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
    cap: int = Query(12, ge=1, le=50),
) -> list[StreetUserResponse]:
    svc = _service(tracker, publisher)
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
