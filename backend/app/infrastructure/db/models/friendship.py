from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class FriendshipORM(Base, IdMixin, TimestampMixin):
    """A single friendship row stored with ``user_low_id < user_high_id``
    so there is exactly one row per (a, b) pair regardless of who asked.

    The DB-level CHECK enforces the ordering invariant; the repo
    pre-sorts ids before reading/writing so callers never have to
    think about it."""

    __tablename__ = "friendships"
    __table_args__ = (
        CheckConstraint(
            "user_low_id < user_high_id",
            name="friendships_low_high_ordered",
        ),
        UniqueConstraint(
            "user_low_id",
            "user_high_id",
            name="uq_friendships_user_low_id_user_high_id",
        ),
        Index("ix_friendships_user_low_id_status", "user_low_id", "status"),
        Index("ix_friendships_user_high_id_status", "user_high_id", "status"),
    )

    user_low_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_high_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    requested_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
