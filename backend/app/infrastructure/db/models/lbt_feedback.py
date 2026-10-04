from __future__ import annotations

from sqlalchemy import Boolean, Index, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class LbtFeedbackORM(Base, IdMixin, TimestampMixin):
    """A LowBatteryTown feedback-box entry. Anonymous unless the sender
    left an e-mail; purged after ``lbt_feedback_retention_days``."""

    __tablename__ = "lbt_feedback"

    category: Mapped[str] = mapped_column(String(16), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    page: Mapped[str | None] = mapped_column(String(200), nullable=True)
    locale: Mapped[str | None] = mapped_column(String(8), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="new", server_default="new"
    )
    sheet_sent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    __table_args__ = (Index("ix_lbt_feedback_status_created_at", "status", "created_at"),)
