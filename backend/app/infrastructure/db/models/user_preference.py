from __future__ import annotations

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class UserPreferenceORM(Base, IdMixin, TimestampMixin):
    """One row per (user, key) — JSONB value per key."""

    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "key", name="uq_user_preferences_user_id_key"
        ),
    )

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
