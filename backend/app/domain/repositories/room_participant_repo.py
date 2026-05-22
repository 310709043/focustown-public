from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

ParticipantRole = Literal["requester", "candidate"]


@dataclass(slots=True, frozen=True)
class RoomParticipantRecord:
    """Domain projection of a ``room_participants`` row."""

    room_id: str
    user_id: str
    role: ParticipantRole
    joined_at: datetime | None
    left_at: datetime | None
    focus_session_id: str | None


class IRoomParticipantRepo(Protocol):
    """Source-of-truth port for ``room_participants``.

    The bulk insert path (``upsert_pair``) is what makes
    ``MatchRoomService.ensure_room_for_match`` idempotent: ``pg_insert
    (...).on_conflict_do_nothing`` on the composite ``(room_id, user_id)``
    primary key collapses concurrent attempts to insert the same pair
    into a single committed pair.
    """

    async def upsert_pair(
        self,
        *,
        room_id: str,
        requester_id: str,
        candidate_id: str,
    ) -> list[RoomParticipantRecord]:
        """Insert both participant rows in one statement.

        Idempotent on the composite primary key — a re-run is a no-op.
        Returns the two rows currently in the DB for this room (which
        may be the ones we just inserted or rows another caller raced
        in first). Order: requester first, candidate second.
        """
        ...

    async def list_by_room(self, room_id: str) -> list[RoomParticipantRecord]:
        """Return both participants of the room.

        Ordering is implementation-defined; callers that need a stable
        ordering should sort by ``role`` (``requester`` first).
        """
        ...

    async def get(
        self, *, room_id: str, user_id: str
    ) -> RoomParticipantRecord | None:
        """Fetch one participant by composite key.

        Used by the join/leave/snapshot endpoints to check "is this
        caller actually a participant of this room?" — returning
        ``None`` means the caller is not a member and the API surface
        translates that to a 404 (not 403, to avoid leaking room
        existence).
        """
        ...

    async def mark_joined(
        self, *, room_id: str, user_id: str, joined_at: datetime
    ) -> RoomParticipantRecord:
        """Set ``joined_at`` to the supplied timestamp.

        Idempotent — a second call updates the timestamp to the new
        value but the room-status transition logic in the service layer
        is what guards against re-firing ``RoomReady``.
        """
        ...

    async def mark_left(
        self, *, room_id: str, user_id: str, left_at: datetime
    ) -> RoomParticipantRecord: ...

    async def link_session(
        self, *, room_id: str, user_id: str, focus_session_id: str
    ) -> RoomParticipantRecord:
        """Attach a started focus session to the participant row.

        Called by ``FocusSessionService.start`` (Phase 08 wiring) when
        the caller starts a session from inside a room. The room id
        plus the caller's user id uniquely identify the row.
        """
        ...
