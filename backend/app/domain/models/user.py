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
    created_at: datetime
    updated_at: datetime

    def public_name(self) -> str:
        return self.display_name or self.email.split("@", 1)[0]
