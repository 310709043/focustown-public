"""LowBatteryTown feedback box

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-04 00:00:00

Anonymous entries (an e-mail only when the sender leaves one); mirrors
edge/migrations/0002_lbt_feedback.sql.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0033"
down_revision: str | Sequence[str] | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lbt_feedback",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("page", sa.String(length=200), nullable=True),
        sa.Column("locale", sa.String(length=8), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="new", nullable=False),
        sa.Column("sheet_sent", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lbt_feedback")),
    )
    op.create_index(
        "ix_lbt_feedback_status_created_at", "lbt_feedback", ["status", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_lbt_feedback_status_created_at", table_name="lbt_feedback")
    op.drop_table("lbt_feedback")
