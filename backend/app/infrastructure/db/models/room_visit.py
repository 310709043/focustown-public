from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class RoomVisitORM(Base, IdMixin, TimestampMixin):
    """An active visitor session inside a room.

    The UNIQUE(visitor_user_id) constraint enforces "a user is in at most
    one room at a time". The service auto-leaves a previous room before
    inserting a new visit row, so the constraint is mostly a safety net
    against concurrent retries — but it also keeps the schema honest
    against direct DB inserts (e.g., admin tooling).
    """

    __tablename__ = "room_visits"

    room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    visitor_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "visitor_user_id", name="uq_room_visits_visitor_user_id"
        ),
    )
