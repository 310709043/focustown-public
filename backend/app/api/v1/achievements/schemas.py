from __future__ import annotations

from pydantic import BaseModel


class AchievementResponse(BaseModel):
    code: str
    icon: str
    title: str
    description: str
