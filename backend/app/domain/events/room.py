from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class RoomOpened:
    """A match-room was created and both participant rows seeded.

    Published by ``MatchRoomService.ensure_room_for_match`` exactly once
    per match (idempotent on subsequent calls). Phase 08's WS adapter
    will fan this out to both users' channels so the frontend can
    transition out of the "accepting" modal state into the focus room.
    """

    room_id: str
    match_id: str
    requester_id: str
    candidate_id: str


@dataclass(slots=True)
class RoomParticipantJoined:
    """A participant flipped ``joined_at`` from NULL to a timestamp."""

    room_id: str
    user_id: str


@dataclass(slots=True)
class RoomReady:
    """Both participants have joined — the room transitioned to
    ``both_joined`` and the shared timer (Phase 08) can start counting
    down. Published at most once per room.
    """

    room_id: str


@dataclass(slots=True)
class RoomEnded:
    """The room reached a terminal state.

    ``reason`` is one of: ``completed``, ``timeout``, ``abandoned``,
    ``both_left``. Phase 08's sweep job sets ``timeout``; both-left
    handling lives in this phase (``MatchRoomService.leave``).
    """

    room_id: str
    reason: str


__all__ = [
    "RoomEnded",
    "RoomOpened",
    "RoomParticipantJoined",
    "RoomReady",
]
