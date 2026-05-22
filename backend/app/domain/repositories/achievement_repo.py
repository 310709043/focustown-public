from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True)
class AchievementRecord:
    code: str
    icon: str
    title: str
    description: str
    # Used as the ``id`` half of the cursor coordinate; ``code`` doubles
    # as a stable primary key for the catalog so we don't need a synthetic
    # uuid column for the API envelope.
    created_at: datetime | None = None


@dataclass(slots=True)
class UserAchievementRecord:
    user_id: str
    achievement_code: str


class IAchievementRepo(Protocol):
    async def list_all(
        self,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[AchievementRecord]:
        """Catalog rows, paginated. Over-fetched by one for next_cursor."""
        ...

    async def list_for_user(
        self,
        user_id: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[AchievementRecord]: ...

    async def grant(self, *, user_id: str, achievement_code: str) -> bool:
        """Returns True if newly granted, False if already owned."""
        ...
