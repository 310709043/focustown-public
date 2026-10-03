"""LowBatteryTown safety reports

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-03 00:00:00

Anonymous guests have no user row, so a report stores both guest ids,
their profiles and a transcript snapshot taken when the report was filed.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0032"
down_revision: str | Sequence[str] | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lbt_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("reporter_guest_id", sa.String(length=64), nullable=False),
        sa.Column("reported_guest_id", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("transcript", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("reporter_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("reported_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="open", nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lbt_reports")),
    )
    op.create_index(
        "ix_lbt_reports_status_created_at", "lbt_reports", ["status", "created_at"]
    )
    op.create_index("ix_lbt_reports_reported_guest_id", "lbt_reports", ["reported_guest_id"])


def downgrade() -> None:
    op.drop_index("ix_lbt_reports_reported_guest_id", table_name="lbt_reports")
    op.drop_index("ix_lbt_reports_status_created_at", table_name="lbt_reports")
    op.drop_table("lbt_reports")
