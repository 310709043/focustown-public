from __future__ import annotations

from pydantic import BaseModel


class LeaderboardEntryResponse(BaseModel):
    user_id: str
    display_name: str
    character_key: str | None
    completed_count: int
