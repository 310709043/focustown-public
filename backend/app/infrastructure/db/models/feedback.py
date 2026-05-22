from __future__ import annotations

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin
from app.infrastructure.db.models.user import UserORM


class FeedbackSubmissionORM(Base, IdMixin, TimestampMixin):
    """User-submitted feedback (bug / suggestion / other). One row per
    submission. ``context`` is a free-form JSONB blob holding browser
    metadata (url, user-agent, locale, app-version) — we don't query
    inside it so no GIN index is needed."""

    __tablename__ = "feedback_submissions"

    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="new", server_default="new"
    )
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    app_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Read-only join to the users table for the admin CSV export. No
    # back-ref on UserORM — we never traverse user → feedback rows in
    # application code, and skipping back_populates keeps the User model
    # free of feedback knowledge.
    user: Mapped[UserORM | None] = relationship(
        UserORM,
        lazy="raise",
        viewonly=True,
    )

    __table_args__ = (
        Index("ix_feedback_submissions_status_created_at", "status", "created_at"),
    )
