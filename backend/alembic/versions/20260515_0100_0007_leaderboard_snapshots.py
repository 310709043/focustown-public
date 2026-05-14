"""leaderboard_snapshots — daily frozen leaderboard rows

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-15 01:00:00

Adds the destination table for the worker's daily snapshot job. The
worker writes one row per top-N user per day (UTC) so historical reads
don't have to re-aggregate ``focus_sessions``. ``(snapshot_date, user_id)``
is UNIQUE so the writer can use ``INSERT ... ON CONFLICT DO NOTHING``
to stay idempotent on retries / replays.

Hand-written; autogenerate sometimes mangles ``ForeignKey ondelete``.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "leaderboard_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("completed_count", sa.Integer(), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_leaderboard_snapshots_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_leaderboard_snapshots"),
        sa.UniqueConstraint(
            "snapshot_date", "user_id", name="uq_leaderboard_snapshot_day_user"
        ),
    )
    op.create_index(
        "ix_leaderboard_snapshots_snapshot_date",
        "leaderboard_snapshots",
        ["snapshot_date"],
    )
    op.create_index(
        "ix_leaderboard_snapshots_user_id",
        "leaderboard_snapshots",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_leaderboard_snapshots_user_id", table_name="leaderboard_snapshots"
    )
    op.drop_index(
        "ix_leaderboard_snapshots_snapshot_date", table_name="leaderboard_snapshots"
    )
    op.drop_table("leaderboard_snapshots")
