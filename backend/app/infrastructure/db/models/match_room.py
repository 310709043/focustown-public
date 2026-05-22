from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class MatchRoomORM(Base):
    """Shared focus room created when a match is accepted.

    One row per match (UNIQUE on ``match_id``). The
    ``status`` column is the room's lifecycle state machine —
    ``open`` → ``both_joined`` → ``active`` → ``ended`` — with
    ``opened_at`` / ``activated_at`` / ``ended_at`` stamping the
    transitions and ``ended_reason`` carrying the terminal-state
    reason code (``completed`` | ``timeout`` | ``abandoned`` |
    ``both_left``).

    Distinct from the owner-room ``RoomORM`` (a user's permanent
    decor room). Both tables coexist; see CLAUDE.md "Pragmatic
    dual-model exception" section for the dual-model rule.
    """

    __tablename__ = "match_rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    match_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="open"
    )  # open | both_joined | active | ended
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    activated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
