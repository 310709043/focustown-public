from __future__ import annotations

from typing import Protocol

from app.domain.models import Match, MatchStatus


class IMatchRepo(Protocol):
    async def create(
        self,
        *,
        match_id: str,
        requester_id: str,
        candidate_id: str,
        compatibility: int,
        reason: str,
    ) -> Match: ...
    async def get(self, match_id: str) -> Match | None: ...
    async def update_status(self, *, match_id: str, status: MatchStatus) -> Match: ...
    async def list_recent_for_user(
        self, *, user_id: str, limit: int
    ) -> list[Match]: ...
