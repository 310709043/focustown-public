from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class RoomPlaybackORM(Base, IdMixin, TimestampMixin):
    """Shared playback timeline for a single room.

    The UNIQUE(room_id) constraint enforces "one row per room".
    Upserts use ``INSERT ... ON CONFLICT (room_id) DO UPDATE`` so
    concurrent play() retries collapse to a single row deterministically.

    Timestamps for the *timeline* live in ``started_at_ms`` /
    ``paused_at_ms`` (epoch milliseconds; nullable when no track is
    loaded). The ``created_at`` / ``updated_at`` columns from
    TimestampMixin track ROW lifecycle, not playback semantics.
    """

    __tablename__ = "room_playback"

    room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    current_track_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("tracks.id", ondelete="SET NULL"),
        nullable=True,
    )
    started_at_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    paused_at_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_playing: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    __table_args__ = (
        UniqueConstraint("room_id", name="uq_room_playback_room_id"),
    )
