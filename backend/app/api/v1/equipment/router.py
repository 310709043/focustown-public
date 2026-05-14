from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.equipment.schemas import (
    EquipmentResponse,
    EquipmentUpdateRequest,
    VehicleRenderMetaResponse,
)
from app.core.deps import CurrentUserId, DbDep, RealtimePublisherDep
from app.domain.services.equipment_service import EquipmentService
from app.domain.services.presence_service import STREET_CHANNEL
from app.infrastructure.db.repositories import (
    SqlShopRepo,
    SqlUserItemRepo,
    SqlUserRepo,
)

router = APIRouter()


def _service(db) -> EquipmentService:
    return EquipmentService(
        users=SqlUserRepo(db),
        user_items=SqlUserItemRepo(db),
        shop=SqlShopRepo(db),
    )


@router.put("", response_model=EquipmentResponse)
async def put_equipment(
    payload: EquipmentUpdateRequest,
    user_id: CurrentUserId,
    db: DbDep,
    publisher: RealtimePublisherDep,
) -> EquipmentResponse:
    svc = _service(db)
    user = await svc.equip_vehicle(
        user_id=user_id,
        shop_item_id=payload.vehicle_item_id,
    )
    # Broadcast a presence delta so other clients re-fetch the street
    # snapshot (which now carries the new render_meta). Done at the
    # transport layer, not in the service, so the service stays free of
    # realtime knowledge.
    await publisher.publish(
        STREET_CHANNEL,
        {
            "type": "presence.changed",
            "user_id": user_id,
            "state": "on_street",
            "equipment_changed": True,
        },
    )
    vehicle = await svc.resolve_vehicle(user.equipped_vehicle_item_id)
    return EquipmentResponse(
        equipped_vehicle_item_id=user.equipped_vehicle_item_id,
        equipped_vehicle=(
            VehicleRenderMetaResponse(
                icon=vehicle.icon,
                body_color=vehicle.body_color,
                roof_color=vehicle.roof_color,
            )
            if vehicle is not None
            else None
        ),
    )
