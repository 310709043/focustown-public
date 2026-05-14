from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.equipment.schemas import (
    EquipmentResponse,
    EquipmentUpdateRequest,
    VehicleRenderMetaResponse,
)
from app.core.deps import CurrentUserId, DbDep
from app.domain.services.equipment_service import EquipmentService
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.repositories import (
    SqlShopRepo,
    SqlUserItemRepo,
    SqlUserRepo,
)
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher

router = APIRouter()


def _service(db) -> EquipmentService:
    return EquipmentService(
        users=SqlUserRepo(db),
        user_items=SqlUserItemRepo(db),
        shop=SqlShopRepo(db),
        publisher=RedisPubSubPublisher(get_redis()),
    )


@router.put("", response_model=EquipmentResponse)
async def put_equipment(
    payload: EquipmentUpdateRequest,
    user_id: CurrentUserId,
    db: DbDep,
) -> EquipmentResponse:
    svc = _service(db)
    user = await svc.equip_vehicle(
        user_id=user_id,
        shop_item_id=payload.vehicle_item_id,
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
