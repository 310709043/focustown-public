from __future__ import annotations

from pydantic import BaseModel


class VehicleRenderMetaResponse(BaseModel):
    icon: str
    body_color: str
    roof_color: str


class EquipmentUpdateRequest(BaseModel):
    """Sets the vehicle equipment slot.

    - ``"<shop_item_id>"`` — equip that vehicle (must be owned + a car)
    - ``null`` — unequip; fall back to the character_key's default colors

    The wire form is always present (no partial-update semantics here);
    clients that want to leave a slot alone simply don't call this endpoint.
    """

    vehicle_item_id: str | None


class EquipmentResponse(BaseModel):
    equipped_vehicle_item_id: str | None
    equipped_vehicle: VehicleRenderMetaResponse | None
