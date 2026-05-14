from __future__ import annotations

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class RoomORM(Base, IdMixin, TimestampMixin):
    """Persistent per-user room. One row per (owner, room).

    Phase 4 enforces ``UNIQUE(owner_user_id)`` so each user has exactly
    one room; multi-room support is a future extension. ``visibility`` +
    ``max_visitors`` are pre-wired for Phase 8's visit admission logic
    but the Phase 4 API leaves them at their defaults.
    """

    __tablename__ = "rooms"

    owner_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    theme: Mapped[str] = mapped_column(String(16), nullable=False, default="night")
    visibility: Mapped[str] = mapped_column(
        String(16), nullable=False, default="public"
    )
    max_visitors: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    __table_args__ = (
        UniqueConstraint("owner_user_id", name="uq_rooms_owner_user_id"),
        CheckConstraint(
            "visibility IN ('public', 'invite_only')",
            name="ck_rooms_visibility",
        ),
    )
