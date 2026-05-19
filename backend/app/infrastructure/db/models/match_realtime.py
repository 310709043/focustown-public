from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class MatchMessageORM(Base, IdMixin, TimestampMixin):
    """Append-only chat row inside a matched focus room."""

    __tablename__ = "match_messages"
    __table_args__ = (
        Index(
            "ix_match_messages_match_id_created_at",
            "match_id",
            "created_at",
        ),
    )

    match_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="text")
    body: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class MatchAgendaItemORM(Base, IdMixin, TimestampMixin):
    """Single checklist item inside a matched focus room. Order is
    controlled by ``position``; status is one of pending|in_progress|done."""

    __tablename__ = "match_agenda_items"
    __table_args__ = (
        Index(
            "ix_match_agenda_items_match_id_position",
            "match_id",
            "position",
        ),
    )

    match_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
    )
    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    checked_by: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
