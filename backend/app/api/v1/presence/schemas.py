from __future__ import annotations

from pydantic import BaseModel


class VehicleViewResponse(BaseModel):
    icon: str
    body_color: str
    roof_color: str


class StreetUserResponse(BaseModel):
    id: str
    display_name: str
    character_key: str | None
    status: str
    activity: str | None = None
    is_bot: bool = False
    vehicle: VehicleViewResponse | None = None
