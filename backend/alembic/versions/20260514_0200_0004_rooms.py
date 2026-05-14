"""rooms table — per-user persistent room

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-14 12:00:00

Phase 4: every user owns exactly one room. Visibility + max_visitors are
forward-declared for Phase 8 (visitor admission); Phase 4 keeps both at
their server defaults. ``visibility`` is a constrained VARCHAR (not a
Postgres ENUM) so future values won't require a migration. Hand-written
because autogenerate sometimes mangles ``CHECK`` constraints.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column(
            "theme",
            sa.String(length=16),
            nullable=False,
            server_default="night",
        ),
        sa.Column(
            "visibility",
            sa.String(length=16),
            nullable=False,
            server_default="public",
        ),
        sa.Column(
            "max_visitors",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("5"),
        ),
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
            ["owner_user_id"],
            ["users.id"],
            name="fk_rooms_owner_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_rooms"),
        sa.UniqueConstraint("owner_user_id", name="uq_rooms_owner_user_id"),
        sa.CheckConstraint(
            "visibility IN ('public', 'invite_only')",
            name="ck_rooms_visibility",
        ),
    )
    op.create_index(
        "ix_rooms_owner_user_id",
        "rooms",
        ["owner_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_rooms_owner_user_id", table_name="rooms")
    op.drop_table("rooms")
