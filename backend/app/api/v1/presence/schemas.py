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
    vehicle: VehicleViewResponse | None = None
