from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class RoomItemORM(Base, IdMixin, TimestampMixin):
    """One decoration placement.

    ``x`` and ``y`` are integer percentages of the room interior bounding
    box (0–100). The CHECK constraints are the second line of defense; the
    service validates the same range before the DB sees it.
    """

    __tablename__ = "room_items"

    room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("user_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    x: Mapped[int] = mapped_column(Integer, nullable=False)
    y: Mapped[int] = mapped_column(Integer, nullable=False)
    z_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        CheckConstraint("x BETWEEN 0 AND 100", name="x_pct"),
        CheckConstraint("y BETWEEN 0 AND 100", name="y_pct"),
    )
