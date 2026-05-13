from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class AchievementRecord:
    code: str
    icon: str
    title: str
    description: str


@dataclass(slots=True)
class UserAchievementRecord:
    user_id: str
    achievement_code: str


class IAchievementRepo(Protocol):
    async def list_all(self) -> list[AchievementRecord]: ...
    async def list_for_user(self, user_id: str) -> list[AchievementRecord]: ...
    async def grant(self, *, user_id: str, achievement_code: str) -> bool:
        """Returns True if newly granted, False if already owned."""
        ...
