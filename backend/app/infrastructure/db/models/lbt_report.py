from __future__ import annotations

from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class LbtReportORM(Base, IdMixin, TimestampMixin):
    """A LowBatteryTown safety report. Guests are anonymous, so the row
    keeps the guest ids, both profiles and a transcript snapshot taken at
    report time — the live transcript in Redis expires on its own."""

    __tablename__ = "lbt_reports"

    conversation_id: Mapped[str] = mapped_column(String(36), nullable=False)
    reporter_guest_id: Mapped[str] = mapped_column(String(64), nullable=False)
    reported_guest_id: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript: Mapped[list] = mapped_column(JSONB, nullable=False)
    reporter_profile: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reported_profile: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="open", server_default="open"
    )

    __table_args__ = (
        Index("ix_lbt_reports_status_created_at", "status", "created_at"),
        Index("ix_lbt_reports_reported_guest_id", "reported_guest_id"),
    )
