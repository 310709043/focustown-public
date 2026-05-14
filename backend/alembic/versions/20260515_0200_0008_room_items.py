"""room_items — owner-placed decoration items inside a room

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-15 02:00:00

Stores one row per decoration placement: a (room, user_item) tuple with
x/y as integer percentages (0–100) so the coordinate space stays
resolution-independent (the room interior is laid out with percentage
heights / inset-0 walls; see frontend/components/town/room/{Wall,Floor}.tsx).

``z_index`` lets later placements render above earlier ones; default 0
means the very first item shows up flush, no z-stacking surprise.

The ``user_item_id`` FK with ``ON DELETE CASCADE`` means if the user ever
loses an inventory item (refund, admin revoke), the placement disappears
with it — that's the right behavior; you can't "decorate with what you
don't own".

Hand-written; autogenerate is not used while two lanes ship in parallel.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "room_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("user_item_id", sa.String(length=36), nullable=False),
        sa.Column("x", sa.Integer(), nullable=False),
        sa.Column("y", sa.Integer(), nullable=False),
        sa.Column(
            "z_index", sa.Integer(), nullable=False, server_default="0"
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
            name="fk_room_items_room_id_rooms",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_item_id"],
            ["user_items.id"],
            name="fk_room_items_user_item_id_user_items",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_room_items"),
        sa.CheckConstraint(
            "x BETWEEN 0 AND 100", name="ck_room_items_x_pct"
        ),
        sa.CheckConstraint(
            "y BETWEEN 0 AND 100", name="ck_room_items_y_pct"
        ),
    )
    op.create_index(
        "ix_room_items_room_id",
        "room_items",
        ["room_id"],
    )
    op.create_index(
        "ix_room_items_user_item_id",
        "room_items",
        ["user_item_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_room_items_user_item_id", table_name="room_items")
    op.drop_index("ix_room_items_room_id", table_name="room_items")
    op.drop_table("room_items")
