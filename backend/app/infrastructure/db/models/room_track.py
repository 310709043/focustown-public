from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class RoomTrackORM(Base, IdMixin, TimestampMixin):
    """Join row between a ``rooms`` entry and a ``tracks`` entry.

    ``position`` is a per-room ordering index (0-based). Duplicates within
    a room are rejected by the UNIQUE constraint so the SQL adapter can
    raise ``IdempotencyViolationError`` and the service can translate to
    ``ConflictError("already_in_playlist")``.
    """

    __tablename__ = "room_tracks"
    __table_args__ = (
        UniqueConstraint("room_id", "track_id", name="uq_room_tracks_room_id_track_id"),
    )

    room_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    track_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tracks.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
