"""feedback_submissions table

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-19 00:00:00

User-submitted feedback (bug / suggestion / praise / other). One row per
submission. ``context`` is a JSONB blob holding browser metadata; we
never query inside it so no GIN index is needed. The (status, created_at)
compound index covers the admin triage view (``WHERE status='new'
ORDER BY created_at DESC``).
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: str | Sequence[str] | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback_submissions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="new",
        ),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_feedback_submissions_status_created_at",
        "feedback_submissions",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_feedback_submissions_status_created_at",
        table_name="feedback_submissions",
    )
    op.drop_table("feedback_submissions")
