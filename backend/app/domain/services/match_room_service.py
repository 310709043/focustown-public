from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.clock import IClock
from app.core.events import EventBus
from app.core.exceptions import ConflictError, NotFoundError
from app.core.ids import IIdGenerator
from app.domain.events import (
    RoomEnded,
    RoomOpened,
    RoomParticipantJoined,
    RoomReady,
)
from app.domain.models import Match
from app.domain.repositories.match_room_repo import (
    IMatchRoomRepo,
    MatchRoomRecord,
)
from app.domain.repositories.room_participant_repo import (
    IRoomParticipantRepo,
    RoomParticipantRecord,
)
from app.domain.services.room_timer_service import RoomTimerService


@dataclass(slots=True, frozen=True)
class RoomSnapshot:
    """Aggregate snapshot returned by GET / join / leave endpoints.

    Combines the room row with both participant rows so the frontend
    can render the whole state machine off one round-trip — needed for
    the "Waiting for partner" gating on reload (the in-memory store
    is empty so the focus page asks the server who is in the room).

    Phase 08 added the three ``timer_*`` fields; they're populated only
    while a session is active (else ``None``) so a mid-session reload
    can bridge the gap between mount and the first ``room.timer_tick``.
    """

    room: MatchRoomRecord
    participants: list[RoomParticipantRecord]
    timer_started_at: datetime | None = None
    timer_duration_seconds: int | None = None
    timer_remaining_seconds: int | None = None

    @property
    def timer_expected_end_at(self) -> datetime | None:
        """Convenience derivation — kept off the wire to avoid an extra
        column that the frontend can compute from ``started_at`` +
        ``duration``."""
        if self.timer_started_at is None or self.timer_duration_seconds is None:
            return None
        from datetime import timedelta

        return self.timer_started_at + timedelta(
            seconds=self.timer_duration_seconds
        )


class MatchRoomService:
    """Orchestrates the match-room lifecycle.

    Stays free of FastAPI / SQLAlchemy imports — depends only on the
    repository Protocols and the in-process clock / id / event-bus
    primitives. The HTTP router and ``MatchingService.accept`` are
    the two callers; this service owns the state machine in between.

    State machine:

    ::

        open ──(both joined_at set)──> both_joined ──(Phase 08)──> active
          │                                    │                     │
          └────────────(both left)──────────────┴──── ended ──────────┘
    """

    def __init__(
        self,
        *,
        rooms: IMatchRoomRepo,
        participants: IRoomParticipantRepo,
        events: EventBus,
        ids: IIdGenerator,
        clock: IClock,
        timer: RoomTimerService | None = None,
    ) -> None:
        self._rooms = rooms
        self._participants = participants
        self._events = events
        self._ids = ids
        self._clock = clock
        # Optional so the existing unit-test wiring (no Redis) continues
        # to work. Production deps.py always passes a real timer; routes
        # that touch the timer raise if it's missing.
        self._timer = timer

    # ── creation ────────────────────────────────────────────────────

    async def ensure_room_for_match(
        self, match: Match
    ) -> tuple[MatchRoomRecord, list[RoomParticipantRecord]]:
        """Idempotently materialise the room + both participant rows.

        Called from ``MatchingService.accept`` inside the advisory lock.
        Returns the existing room if accept already created it, else
        creates room + 2 participant rows in one transaction. The SQL
        layer uses ``ON CONFLICT DO NOTHING`` on both inserts so two
        parallel calls converge on a single room + pair.
        """
        existing = await self._rooms.get_by_match_id(match.id)
        if existing is not None:
            participants = await self._participants.list_by_room(existing.id)
            return existing, _ordered(participants)

        room = await self._rooms.create_if_absent(
            room_id=self._ids.new_id(), match_id=match.id
        )
        participants = await self._participants.upsert_pair(
            room_id=room.id,
            requester_id=match.requester_id,
            candidate_id=match.candidate_id,
        )
        await self._events.publish(
            RoomOpened(
                room_id=room.id,
                match_id=match.id,
                requester_id=match.requester_id,
                candidate_id=match.candidate_id,
            )
        )
        return room, participants

    # ── join / leave ───────────────────────────────────────────────

    async def join(self, *, match_id: str, user_id: str) -> RoomSnapshot:
        room = await self._rooms.get_by_match_id(match_id)
        if room is None:
            raise NotFoundError("match_room_not_found")
        # Membership check is the first thing — non-participants get a
        # 404 (not 403) so room existence isn't leaked to outsiders.
        participant = await self._participants.get(
            room_id=room.id, user_id=user_id
        )
        if participant is None:
            raise NotFoundError("match_room_not_found")

        now = self._clock.now()
        if participant.joined_at is None:
            await self._participants.mark_joined(
                room_id=room.id, user_id=user_id, joined_at=now
            )
            await self._events.publish(
                RoomParticipantJoined(room_id=room.id, user_id=user_id)
            )

        participants = await self._participants.list_by_room(room.id)
        # ``both_joined`` transition: every participant has a joined_at
        # AND there are exactly two of them (defensive — the upsert
        # always writes two rows but list_by_room could return a
        # partial view mid-migration).
        if (
            room.status == "open"
            and len(participants) == 2
            and all(p.joined_at is not None for p in participants)
        ):
            room = await self._rooms.set_status(
                room_id=room.id,
                status="both_joined",
                activated_at=now,
            )
            await self._events.publish(RoomReady(room_id=room.id))
        return await self._build_snapshot(room, participants)

    async def leave(self, *, match_id: str, user_id: str) -> RoomSnapshot:
        room = await self._rooms.get_by_match_id(match_id)
        if room is None:
            raise NotFoundError("match_room_not_found")
        participant = await self._participants.get(
            room_id=room.id, user_id=user_id
        )
        if participant is None:
            raise NotFoundError("match_room_not_found")

        now = self._clock.now()
        if participant.left_at is None:
            await self._participants.mark_left(
                room_id=room.id, user_id=user_id, left_at=now
            )

        participants = await self._participants.list_by_room(room.id)
        if (
            room.status != "ended"
            and len(participants) == 2
            and all(p.left_at is not None for p in participants)
        ):
            room = await self._rooms.set_status(
                room_id=room.id,
                status="ended",
                ended_at=now,
                ended_reason="both_left",
            )
            await self._events.publish(
                RoomEnded(room_id=room.id, reason="both_left")
            )
        return await self._build_snapshot(room, participants)

    # ── reads + terminal ───────────────────────────────────────────

    async def get_snapshot(
        self, *, match_id: str, requesting_user_id: str
    ) -> RoomSnapshot:
        room = await self._rooms.get_by_match_id(match_id)
        if room is None:
            raise NotFoundError("match_room_not_found")
        # Non-participant returns 404 (not 403) — see CRITICAL CORRECTNESS
        # NOTES in the Phase 07 plan: "don't leak whether a room exists".
        participant = await self._participants.get(
            room_id=room.id, user_id=requesting_user_id
        )
        if participant is None:
            raise NotFoundError("match_room_not_found")
        participants = await self._participants.list_by_room(room.id)
        return await self._build_snapshot(room, participants)

    async def start_session(
        self,
        *,
        match_id: str,
        user_id: str,
        duration_seconds: int,
    ) -> RoomSnapshot:
        """Transition the room from ``both_joined`` to ``active`` and arm
        the shared countdown.

        Phase 07 created the room; Phase 08 starts the timer. Restricted
        to participants — a non-participant gets 404. The status guard
        is a hard 409 so a stale client double-clicking ``Start`` doesn't
        re-arm the timer (which would reset the partner's countdown).
        """
        if self._timer is None:  # pragma: no cover — defensive wiring
            raise RuntimeError("room_timer_service_not_configured")
        room = await self._rooms.get_by_match_id(match_id)
        if room is None:
            raise NotFoundError("match_room_not_found")
        participant = await self._participants.get(
            room_id=room.id, user_id=user_id
        )
        if participant is None:
            raise NotFoundError("match_room_not_found")
        if room.status == "active":
            # Idempotent re-entry — return the current snapshot so a
            # racing client sees the in-flight timer instead of an error.
            participants = await self._participants.list_by_room(room.id)
            return await self._build_snapshot(room, participants)
        if room.status != "both_joined":
            raise ConflictError("room_not_ready")

        now = self._clock.now()
        room = await self._rooms.set_status(
            room_id=room.id, status="active", activated_at=now
        )
        await self._timer.session_started(
            room_id=room.id,
            started_at=now,
            duration_seconds=duration_seconds,
        )
        participants = await self._participants.list_by_room(room.id)
        return await self._build_snapshot(room, participants)

    async def _build_snapshot(
        self,
        room: MatchRoomRecord,
        participants: list[RoomParticipantRecord],
    ) -> RoomSnapshot:
        timer_started_at: datetime | None = None
        timer_duration_seconds: int | None = None
        timer_remaining_seconds: int | None = None
        if self._timer is not None and room.status == "active":
            state = await self._timer.peek(room.id)
            if state is not None:
                timer_started_at = state.started_at
                timer_duration_seconds = state.duration_seconds
                timer_remaining_seconds = state.remaining_seconds
        return RoomSnapshot(
            room=room,
            participants=_ordered(participants),
            timer_started_at=timer_started_at,
            timer_duration_seconds=timer_duration_seconds,
            timer_remaining_seconds=timer_remaining_seconds,
        )

    async def end(self, *, room_id: str, reason: str) -> None:
        """Terminal transition. Idempotent — a second call is a no-op
        once the room is ``ended``.

        Phase 08's timeout-sweep job will be the production caller;
        exposed in this phase so it can be called from tests and so
        the contract is fixed.
        """
        room = await self._rooms.get(room_id)
        if room is None:
            raise NotFoundError("match_room_not_found")
        if room.status == "ended":
            return
        now = self._clock.now()
        await self._rooms.set_status(
            room_id=room_id,
            status="ended",
            ended_at=now,
            ended_reason=reason,
        )
        await self._events.publish(RoomEnded(room_id=room_id, reason=reason))


def _ordered(
    participants: list[RoomParticipantRecord],
) -> list[RoomParticipantRecord]:
    """Sort participants with ``requester`` first so callers and the
    wire DTO always see a deterministic order."""
    return sorted(participants, key=lambda p: 0 if p.role == "requester" else 1)
