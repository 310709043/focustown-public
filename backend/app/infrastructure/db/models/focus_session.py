from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class FocusSessionORM(Base, IdMixin, TimestampMixin):
    __tablename__ = "focus_sessions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    partner_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    mode: Mapped[str] = mapped_column(String(16), nullable=False)  # focus | short | long
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    elapsed_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="active", nullable=False
    )  # active | completed | abandoned | cancelled
    task_label: Mapped[str | None] = mapped_column(String(256), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Phase 04 — idempotency dedup for POST /sessions. NULL means the caller
    # opted out of dedup; the partial unique index on (user_id, idempotency_key)
    # only fires when both are set.
    idempotency_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_body_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Phase 07 — tie sessions started inside a shared match-room back to
    # the match + room. Both are NULL for solo sessions and the legacy
    # ``partner_user_id``-only path. ON DELETE SET NULL so a match purge
    # doesn't wipe the user's historical streak data.
    match_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("matches.id", ondelete="SET NULL"), nullable=True
    )
    room_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("match_rooms.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
