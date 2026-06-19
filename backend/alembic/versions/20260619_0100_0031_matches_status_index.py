"""Add index on matches.status for admin queries and WS membership checks

Revision ID: 0031
Revises: 0030
Create Date: 2026-06-19 01:00:00

The ``matches.status`` column is used in:

- Admin match listing: ``WHERE status = ...``
- WS membership check: ``WHERE match.status != 'accepted'``
- Admin overview: counting waiting matches

Without an index these queries do sequential scans on the matches table.
"""

from __future__ import annotations

from typing import Sequence

from alembic import op

revision: str = "0031"
down_revision: str | Sequence[str] | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_matches_status",
        "matches",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_matches_status", table_name="matches")
