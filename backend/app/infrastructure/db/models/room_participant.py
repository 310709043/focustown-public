from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class RoomParticipantORM(Base):
    """One row per (match_room, user) — the join-queue ledger.

    Composite primary key ``(room_id, user_id)`` is the dedup key for
    the bulk-insert that materialises both rows when a match is
    accepted. ``role`` is ``requester`` for the original proposer and
    ``candidate`` for the other party — preserved so the UI can render
    the original pairing illustration even after the symmetric
    join/leave actions blur which side initiated.

    ``joined_at`` and ``left_at`` are independently NULLable so the
    state machine can distinguish "invited but not yet joined" (the
    room is ``open``) from "both have joined" (the room is
    ``both_joined``) from "both have left" (the room transitions to
    ``ended`` with ``ended_reason='both_left'``).

    ``focus_session_id`` is the per-participant pointer Phase 08 will
    populate when a focus session is started inside the room — kept on
    the participant rather than the room because each side runs their
    own session row even though the timer is shared.
    """

    __tablename__ = "room_participants"

    room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("match_rooms.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # requester | candidate
    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    left_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    focus_session_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("focus_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
