from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class UserItemResponse(BaseModel):
    id: str
    shop_item_id: str
    acquired_via: str
    acquired_at: datetime
