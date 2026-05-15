"""equipment pointers + shop render_meta

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-14 11:00:00

Phase 3: equippable visuals.
  - users.equipped_vehicle_item_id, equipped_avatar_item_id (FK shop_items)
  - shop_items.render_meta JSONB for visual attrs (vehicles use
    {icon, body_color, roof_color}; future avatar/scene categories can
    declare their own shape).

Hand-written — JSONB needs Postgres dialect import that autogenerate
sometimes mangles into a generic JSON.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | Sequence[str] | None = ("0002", "0002_consent")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── users.equipped_*_item_id ────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column("equipped_vehicle_item_id", sa.String(36), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("equipped_avatar_item_id", sa.String(36), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_equipped_vehicle_item_id_shop_items",
        source_table="users",
        referent_table="shop_items",
        local_cols=["equipped_vehicle_item_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_users_equipped_avatar_item_id_shop_items",
        source_table="users",
        referent_table="shop_items",
        local_cols=["equipped_avatar_item_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_users_equipped_vehicle",
        "users",
        ["equipped_vehicle_item_id"],
        postgresql_where=sa.text("equipped_vehicle_item_id IS NOT NULL"),
    )

    # ── shop_items.render_meta ──────────────────────────────────────────
    op.add_column(
        "shop_items",
        sa.Column("render_meta", postgresql.JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("shop_items", "render_meta")
    op.drop_index("ix_users_equipped_vehicle", table_name="users")
    op.drop_constraint(
        "fk_users_equipped_avatar_item_id_shop_items",
        "users",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_users_equipped_vehicle_item_id_shop_items",
        "users",
        type_="foreignkey",
    )
    op.drop_column("users", "equipped_avatar_item_id")
    op.drop_column("users", "equipped_vehicle_item_id")
