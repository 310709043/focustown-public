from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class User:
    id: str
    email: str
    display_name: str
    character_key: str | None
    role_label: str | None
    is_active: bool
    equipped_vehicle_item_id: str | None
    equipped_avatar_item_id: str | None
    created_at: datetime
    updated_at: datetime
    terms_accepted_at: datetime | None = None
    terms_version: str | None = None
    marketing_opt_in: bool = False
    marketing_opt_in_at: datetime | None = None
    is_bot: bool = False

    def public_name(self) -> str:
        return self.display_name or self.email.split("@", 1)[0]
