from __future__ import annotations

from typing import Protocol

from app.domain.models.room_visit import RoomVisit


class IRoomVisitReader(Protocol):
    """Read-only view over room_visits.

    Services that only render visitor lists or count occupancy depend on
    this Protocol so they cannot accidentally mutate session state.
    """

    async def list_by_room(self, room_id: str) -> list[RoomVisit]: ...
    async def get_by_user(self, visitor_user_id: str) -> RoomVisit | None: ...
    async def count_by_room(self, room_id: str) -> int: ...


class IRoomVisitWriter(Protocol):
    """Write-side over room_visits (start + end sessions)."""

    async def create(
        self,
        *,
        visit_id: str,
        room_id: str,
        visitor_user_id: str,
    ) -> RoomVisit:
        """Insert a new visit row.

        Raises ``ConflictError("already_visiting")`` if the
        ``visitor_user_id`` UNIQUE constraint trips. Callers
        (``RoomVisitService.visit``) translate that into the auto-leave-
        then-rejoin path so the API stays idempotent from the user's POV.
        """

    async def delete(self, visit_id: str) -> None:
        """Idempotent delete — silent no-op on missing id.

        LSP rule: the SQL impl behaves the same so the service can call
        delete without a prior existence check.
        """


class IRoomVisitRepo(IRoomVisitReader, IRoomVisitWriter, Protocol):
    """Full room_visits repository — composes reader + writer.

    Callers that genuinely need both sides (``RoomVisitService``) depend
    on this; everything else should narrow to ``IRoomVisitReader`` or
    ``IRoomVisitWriter`` per Interface Segregation (mirrors the
    ``IUserRepo`` precedent in user_repo.py).
    """
