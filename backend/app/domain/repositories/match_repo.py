from __future__ import annotations

from typing import Protocol

from app.domain.models import Match, MatchStatus


class IMatchReader(Protocol):
    """Read-only view over matches.

    Callers that only need to *look up* matches depend on this Protocol so
    they cannot accidentally mutate state. Used by the /matches/auto router
    when narrowing the recent-candidate de-duplication window.
    """

    async def get(self, match_id: str) -> Match | None: ...
    async def list_recent_for_user(
        self, *, user_id: str, limit: int
    ) -> list[Match]: ...


class IMatchWriter(Protocol):
    """Write-side over matches (create + status transitions)."""

    async def create(
        self,
        *,
        match_id: str,
        requester_id: str,
        candidate_id: str,
        compatibility: int,
        reason: str,
    ) -> Match: ...
    async def update_status(self, *, match_id: str, status: MatchStatus) -> Match: ...


class IMatchRepo(IMatchReader, IMatchWriter, Protocol):
    """Full match repository — composes reader + writer.

    MatchingService needs both sides; narrow consumers (e.g. read-only HTTP
    handlers) should depend on ``IMatchReader`` per Interface Segregation.
    """
