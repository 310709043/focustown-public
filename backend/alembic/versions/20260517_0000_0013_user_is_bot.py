"""add users.is_bot flag for seeded NPC accounts

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-17 00:00:00

Bot users populate the town street and the matching candidate pool when
no real humans are online. Marking them with a dedicated column (rather
than encoding via an email suffix) keeps the read paths simple and lets
leaderboards / analytics filter cleanly in future migrations.

Defaults to FALSE for all existing rows; no data migration needed. The
index supports the worker's hot ``SELECT ... WHERE is_bot = TRUE`` path
that refreshes Redis presence every 60 seconds.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | Sequence[str] | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_bot",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index("ix_users_is_bot", "users", ["is_bot"])


def downgrade() -> None:
    op.drop_index("ix_users_is_bot", table_name="users")
    op.drop_column("users", "is_bot")
