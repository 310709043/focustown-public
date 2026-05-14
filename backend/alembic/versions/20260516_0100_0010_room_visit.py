"""room_visit — active visitor sessions per room

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-16 01:00:00

One row per active "user is currently in room X". Deleted on leave (or on
the next visit, which auto-leaves the previous room — see service logic).
``UNIQUE(visitor_user_id)`` enforces "a user is in at most one room at a
time"; trying to visit a second room while already in the first either
raises (caller decides) or is transparently translated by the service
into "auto-leave-then-rejoin".

CASCADE on both FKs means deleting the room or the user wipes their
visit row automatically — important because the room or user might be
removed by an admin tool without us cleaning up first.

Hand-written (no autogen) per the parallel-migration-ledger discipline.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "room_visits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("visitor_user_id", sa.String(length=36), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
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
            ["room_id"],
            ["rooms.id"],
            name="fk_room_visits_room_id_rooms",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["visitor_user_id"],
            ["users.id"],
            name="fk_room_visits_visitor_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_room_visits"),
        sa.UniqueConstraint(
            "visitor_user_id", name="uq_room_visits_visitor_user_id"
        ),
    )
    op.create_index(
        "ix_room_visits_room_id",
        "room_visits",
        ["room_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_room_visits_room_id", table_name="room_visits")
    op.drop_table("room_visits")
