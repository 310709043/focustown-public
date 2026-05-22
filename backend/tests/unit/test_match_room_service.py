"""MatchRoomService unit tests.

Worth testing:
- ``ensure_room_for_match`` is idempotent — two parallel-ish calls land
  one room row + two participant rows (the SQL contract uses ON
  CONFLICT DO NOTHING, but the service layer also handles the "row
  already exists" shortcut path).
- ``join`` transitions the room to ``both_joined`` only when both
  participants have ``joined_at`` set, and publishes ``RoomReady``
  exactly once for that transition.
- ``leave`` transitions to ``ended`` only when both participants have
  ``left_at`` set.
- ``get_snapshot`` rejects non-participants with ``NotFoundError``
  (not ForbiddenError) — see Phase 07 plan: don't leak room existence.
- ``end`` is idempotent — second call is a no-op once the room is
  ``ended``.

NOT worth testing:
- Repository pass-through on simple reads — covered by the integration
  test in ``tests/integration/test_match_room_lifecycle.py``.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest

from app.core.exceptions import NotFoundError
from app.domain.events import (
    RoomEnded,
    RoomOpened,
    RoomParticipantJoined,
    RoomReady,
)
from app.domain.models import Match, MatchStatus
from app.domain.repositories.match_room_repo import (
    IMatchRoomRepo,
    MatchRoomRecord,
    MatchRoomStatus,
)
from app.domain.repositories.room_participant_repo import (
    IRoomParticipantRepo,
    RoomParticipantRecord,
)
from app.domain.services.match_room_service import MatchRoomService


@dataclass
class FakeMatchRoomRepo(IMatchRoomRepo):
    rows: dict[str, MatchRoomRecord] = field(default_factory=dict)
    create_calls: int = 0

    async def create_if_absent(
        self, *, room_id: str, match_id: str
    ) -> MatchRoomRecord:
        self.create_calls += 1
        for row in self.rows.values():
            if row.match_id == match_id:
                return row  # idempotent — ON CONFLICT DO NOTHING contract
        now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
        record = MatchRoomRecord(
            id=room_id,
            match_id=match_id,
            status="open",
            opened_at=now,
            activated_at=None,
            ended_at=None,
            ended_reason=None,
        )
        self.rows[room_id] = record
        return record

    async def get(self, room_id: str) -> MatchRoomRecord | None:
        return self.rows.get(room_id)

    async def get_by_match_id(self, match_id: str) -> MatchRoomRecord | None:
        for row in self.rows.values():
            if row.match_id == match_id:
                return row
        return None

    async def set_status(
        self,
        *,
        room_id: str,
        status: MatchRoomStatus,
        activated_at: datetime | None = None,
        ended_at: datetime | None = None,
        ended_reason: str | None = None,
    ) -> MatchRoomRecord:
        row = self.rows[room_id]
        updated = MatchRoomRecord(
            id=row.id,
            match_id=row.match_id,
            status=status,
            opened_at=row.opened_at,
            activated_at=activated_at if activated_at is not None else row.activated_at,
            ended_at=ended_at if ended_at is not None else row.ended_at,
            ended_reason=ended_reason if ended_reason is not None else row.ended_reason,
        )
        self.rows[room_id] = updated
        return updated


@dataclass
class FakeRoomParticipantRepo(IRoomParticipantRepo):
    rows: dict[tuple[str, str], RoomParticipantRecord] = field(default_factory=dict)
    upsert_calls: int = 0

    async def upsert_pair(
        self,
        *,
        room_id: str,
        requester_id: str,
        candidate_id: str,
    ) -> list[RoomParticipantRecord]:
        self.upsert_calls += 1
        for uid, role in ((requester_id, "requester"), (candidate_id, "candidate")):
            key = (room_id, uid)
            if key not in self.rows:
                self.rows[key] = RoomParticipantRecord(
                    room_id=room_id,
                    user_id=uid,
                    role=role,  # type: ignore[arg-type]
                    joined_at=None,
                    left_at=None,
                    focus_session_id=None,
                )
        return await self.list_by_room(room_id)

    async def list_by_room(self, room_id: str) -> list[RoomParticipantRecord]:
        rows = [r for (rid, _), r in self.rows.items() if rid == room_id]
        rows.sort(key=lambda r: 0 if r.role == "requester" else 1)
        return rows

    async def get(
        self, *, room_id: str, user_id: str
    ) -> RoomParticipantRecord | None:
        return self.rows.get((room_id, user_id))

    async def mark_joined(
        self, *, room_id: str, user_id: str, joined_at: datetime
    ) -> RoomParticipantRecord:
        row = self.rows[(room_id, user_id)]
        updated = RoomParticipantRecord(
            room_id=row.room_id,
            user_id=row.user_id,
            role=row.role,
            joined_at=joined_at,
            left_at=row.left_at,
            focus_session_id=row.focus_session_id,
        )
        self.rows[(room_id, user_id)] = updated
        return updated

    async def mark_left(
        self, *, room_id: str, user_id: str, left_at: datetime
    ) -> RoomParticipantRecord:
        row = self.rows[(room_id, user_id)]
        updated = RoomParticipantRecord(
            room_id=row.room_id,
            user_id=row.user_id,
            role=row.role,
            joined_at=row.joined_at,
            left_at=left_at,
            focus_session_id=row.focus_session_id,
        )
        self.rows[(room_id, user_id)] = updated
        return updated

    async def link_session(
        self, *, room_id: str, user_id: str, focus_session_id: str
    ) -> RoomParticipantRecord:
        row = self.rows[(room_id, user_id)]
        updated = RoomParticipantRecord(
            room_id=row.room_id,
            user_id=row.user_id,
            role=row.role,
            joined_at=row.joined_at,
            left_at=row.left_at,
            focus_session_id=focus_session_id,
        )
        self.rows[(room_id, user_id)] = updated
        return updated


def _make_match() -> Match:
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    return Match(
        id="m-1",
        requester_id="u-alice",
        candidate_id="u-bob",
        compatibility=80,
        reason="overlap",
        status=MatchStatus.ACCEPTED,
        created_at=now,
        updated_at=now,
    )


def _make_service(
    *, ids, events, clock
) -> tuple[MatchRoomService, FakeMatchRoomRepo, FakeRoomParticipantRepo]:
    rooms_repo = FakeMatchRoomRepo()
    participants_repo = FakeRoomParticipantRepo()
    svc = MatchRoomService(
        rooms=rooms_repo,
        participants=participants_repo,
        events=events,
        ids=ids,
        clock=clock,
    )
    return svc, rooms_repo, participants_repo


# ── ensure_room_for_match ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_ensure_room_creates_room_and_two_participants(ids, events, clock):
    svc, rooms, participants = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    room, parts = await svc.ensure_room_for_match(match)
    assert room.match_id == match.id
    assert {p.user_id for p in parts} == {"u-alice", "u-bob"}


@pytest.mark.asyncio
async def test_ensure_room_publishes_room_opened_exactly_once(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    captured: list[RoomOpened] = []

    async def _record(e: RoomOpened) -> None:
        captured.append(e)

    events.subscribe(RoomOpened, _record)
    match = _make_match()
    # Run the same ensure_room_for_match twice — second call must be a
    # no-op for the event bus (replay safety).
    await svc.ensure_room_for_match(match)
    await svc.ensure_room_for_match(match)
    assert len(captured) == 1
    assert captured[0].match_id == match.id


@pytest.mark.asyncio
async def test_ensure_room_idempotent_under_parallel_calls(ids, events, clock):
    svc, rooms, participants = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    results = await asyncio.gather(
        svc.ensure_room_for_match(match),
        svc.ensure_room_for_match(match),
        svc.ensure_room_for_match(match),
    )
    room_ids = {r[0].id for r in results}
    # All three calls converge on the same room id — that's the contract.
    assert len(room_ids) == 1
    # And the participant table contains exactly the two expected pairs.
    pair_keys = {k for k in participants.rows.keys()}
    only_room_id = next(iter(room_ids))
    assert pair_keys == {
        (only_room_id, "u-alice"),
        (only_room_id, "u-bob"),
    }


# ── join ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_join_first_party_keeps_room_open(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    snapshot = await svc.join(match_id=match.id, user_id="u-alice")
    assert snapshot.room.status == "open"


@pytest.mark.asyncio
async def test_join_second_party_transitions_to_both_joined(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    await svc.join(match_id=match.id, user_id="u-alice")
    snapshot = await svc.join(match_id=match.id, user_id="u-bob")
    assert snapshot.room.status == "both_joined"
    assert snapshot.room.activated_at is not None


@pytest.mark.asyncio
async def test_join_publishes_room_ready_once(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    captured: list[RoomReady] = []

    async def _record(e: RoomReady) -> None:
        captured.append(e)

    events.subscribe(RoomReady, _record)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    await svc.join(match_id=match.id, user_id="u-alice")
    await svc.join(match_id=match.id, user_id="u-bob")
    # A second join from the same user must NOT re-publish RoomReady —
    # the transition has already happened.
    await svc.join(match_id=match.id, user_id="u-bob")
    assert len(captured) == 1


@pytest.mark.asyncio
async def test_join_publishes_participant_joined_only_on_first_transition(
    ids, events, clock
):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    captured: list[RoomParticipantJoined] = []

    async def _record(e: RoomParticipantJoined) -> None:
        captured.append(e)

    events.subscribe(RoomParticipantJoined, _record)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    await svc.join(match_id=match.id, user_id="u-alice")
    await svc.join(match_id=match.id, user_id="u-alice")  # replay
    assert len(captured) == 1
    assert captured[0].user_id == "u-alice"


@pytest.mark.asyncio
async def test_join_rejects_non_participant_with_404(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    with pytest.raises(NotFoundError):
        await svc.join(match_id=match.id, user_id="u-stranger")


# ── leave ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_leave_first_party_keeps_room_open(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    snapshot = await svc.leave(match_id=match.id, user_id="u-alice")
    assert snapshot.room.status != "ended"


@pytest.mark.asyncio
async def test_leave_both_parties_transitions_to_ended(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    captured: list[RoomEnded] = []

    async def _record(e: RoomEnded) -> None:
        captured.append(e)

    events.subscribe(RoomEnded, _record)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    await svc.leave(match_id=match.id, user_id="u-alice")
    snapshot = await svc.leave(match_id=match.id, user_id="u-bob")
    assert snapshot.room.status == "ended"
    assert snapshot.room.ended_reason == "both_left"
    assert captured == [RoomEnded(room_id=snapshot.room.id, reason="both_left")]


# ── get_snapshot ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_snapshot_rejects_non_participant_with_404(
    ids, events, clock
):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    with pytest.raises(NotFoundError):
        await svc.get_snapshot(
            match_id=match.id, requesting_user_id="u-stranger"
        )


@pytest.mark.asyncio
async def test_get_snapshot_returns_full_state_for_participant(
    ids, events, clock
):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    match = _make_match()
    await svc.ensure_room_for_match(match)
    snapshot = await svc.get_snapshot(
        match_id=match.id, requesting_user_id="u-alice"
    )
    # Requester ordered first, candidate second.
    assert [p.user_id for p in snapshot.participants] == ["u-alice", "u-bob"]


# ── end ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_end_is_idempotent(ids, events, clock):
    svc, _, _ = _make_service(ids=ids, events=events, clock=clock)
    captured: list[RoomEnded] = []

    async def _record(e: RoomEnded) -> None:
        captured.append(e)

    events.subscribe(RoomEnded, _record)
    match = _make_match()
    room, _ = await svc.ensure_room_for_match(match)
    await svc.end(room_id=room.id, reason="timeout")
    await svc.end(room_id=room.id, reason="timeout")  # second call no-op
    assert len(captured) == 1
