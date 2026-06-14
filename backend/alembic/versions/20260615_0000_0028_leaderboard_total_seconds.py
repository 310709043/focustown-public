"""rename leaderboard_snapshots completed_count to total_seconds

Revision ID: 0028
Revises: 0027
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "leaderboard_snapshots",
        "completed_count",
        new_column_name="total_seconds",
        existing_type=sa.Integer(),
    )


def downgrade() -> None:
    op.alter_column(
        "leaderboard_snapshots",
        "total_seconds",
        new_column_name="completed_count",
        existing_type=sa.Integer(),
    )
