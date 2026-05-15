from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class NoteORM(Base, IdMixin, TimestampMixin):
    __tablename__ = "notes"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # NULL = private to ``user_id``. When set, the note is visible to
    # both members of the match (private/shared notepad toggle in the
    # matched focus room). ON DELETE SET NULL — closing the match
    # silently demotes the note back to private.
    shared_in_match_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("matches.id", ondelete="SET NULL"),
        nullable=True,
    )
