"""friendships table — single-row-per-pair model

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-19 02:00:00

One row per friendship pair. We store both user ids in deterministic
order (``user_low_id`` < ``user_high_id``) so the UNIQUE constraint on
(low, high) gives us "no duplicate friendships" for free, regardless
of which side initiated. The ``requested_by`` column carries the
direction info needed for the "accept / reject incoming" UX without
needing a second row.

Status is a small enum-like string:
- ``requested`` — the requester is waiting for the other side
- ``accepted`` — both sides confirmed; visible everywhere as a friend
- ``blocked`` — one side blocked the other (rejects future requests
  from either side until lifted)

Two B-tree indexes — one per side — cover the "list my friends" /
"list my requests" query patterns. The CHECK constraint on
(user_low_id < user_high_id) keeps the ordering invariant enforced
even if a future refactor forgets it.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | Sequence[str] | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "friendships",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_low_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_high_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "requested_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "user_low_id < user_high_id",
            name="friendships_low_high_ordered",
        ),
        sa.UniqueConstraint(
            "user_low_id", "user_high_id", name="uq_friendships_user_low_id_user_high_id"
        ),
    )
    op.create_index(
        "ix_friendships_user_low_id_status",
        "friendships",
        ["user_low_id", "status"],
    )
    op.create_index(
        "ix_friendships_user_high_id_status",
        "friendships",
        ["user_high_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_friendships_user_high_id_status", table_name="friendships")
    op.drop_index("ix_friendships_user_low_id_status", table_name="friendships")
    op.drop_table("friendships")
