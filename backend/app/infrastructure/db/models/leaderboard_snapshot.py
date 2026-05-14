from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class LeaderboardSnapshotORM(Base, IdMixin, TimestampMixin):
    """Frozen daily leaderboard row.

    Written by the worker shortly after midnight UTC for the *previous* day.
    The ``(snapshot_date, user_id)`` UNIQUE constraint lets the writer use
    ``INSERT ... ON CONFLICT DO NOTHING`` so re-runs are idempotent.
    """

    __tablename__ = "leaderboard_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "snapshot_date", "user_id", name="uq_leaderboard_snapshot_day_user"
        ),
    )

    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    completed_count: Mapped[int] = mapped_column(Integer, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
