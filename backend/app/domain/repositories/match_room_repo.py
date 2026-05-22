from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

MatchRoomStatus = Literal["open", "both_joined", "active", "ended"]
"""Lifecycle state machine for a ``match_rooms`` row.

``open`` is the initial state set by ``ensure_room_for_match``.
``both_joined`` follows when both participants flip ``joined_at``.
``active`` is Phase 08's "the timer has started" transition.
``ended`` is terminal — set when both participants leave, the room
times out, or both sessions complete.
"""


@dataclass(slots=True, frozen=True)
class MatchRoomRecord:
    """Domain projection of a ``match_rooms`` row.

    ORM-free so domain services can depend on this protocol without
    pulling SQLAlchemy into the domain layer.
    """

    id: str
    match_id: str
    status: MatchRoomStatus
    opened_at: datetime
    activated_at: datetime | None
    ended_at: datetime | None
    ended_reason: str | None


class IMatchRoomRepo(Protocol):
    """Source-of-truth port for ``match_rooms``.

    The ``create_if_absent`` method is the heart of Phase 07's
    idempotency story: two concurrent ``MatchingService.accept`` calls
    can both invoke it without producing duplicate rows, because the
    SQL adapter uses ``pg_insert(...).on_conflict_do_nothing`` on the
    UNIQUE ``match_id``. The advisory lock in ``accept`` is the first
    line of defence (prevents the read race); this is the second
    (prevents a double-INSERT if the lock is bypassed).
    """

    async def create_if_absent(
        self, *, room_id: str, match_id: str
    ) -> MatchRoomRecord:
        """Insert a new room row keyed by ``match_id`` (UNIQUE).

        Idempotent: when a row already exists for the match, returns
        the existing row unchanged. ``room_id`` is only persisted on
        first-insert; subsequent callers get the canonical id back.
        """
        ...

    async def get(self, room_id: str) -> MatchRoomRecord | None: ...

    async def get_by_match_id(self, match_id: str) -> MatchRoomRecord | None: ...

    async def set_status(
        self,
        *,
        room_id: str,
        status: MatchRoomStatus,
        activated_at: datetime | None = None,
        ended_at: datetime | None = None,
        ended_reason: str | None = None,
    ) -> MatchRoomRecord:
        """Narrow status update.

        Only writes the fields the caller passes; timestamp columns
        unmentioned in the call are left untouched. Used to mark the
        ``open → both_joined`` and ``both_joined → ended`` transitions
        atomically without re-reading the row.
        """
        ...
