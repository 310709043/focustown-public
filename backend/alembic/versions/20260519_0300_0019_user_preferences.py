"""user_preferences — generic JSONB key/value bag

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-19 03:00:00

One row per (user, key). JSONB value lets each known preference key
own its own shape (validated at the service layer) without paying
for a wide multi-column schema or a separate table per preference.
We never query *inside* the JSONB, so no GIN index — the unique
(user_id, key) index already covers the only access pattern
("look up one user's preferences").

Keys are namespaced strings (``sound.mix``, ``notifications.daily``,
``language.preferred``, ``focus.daily_goal``, ``focus.duration_minutes``,
``ui.scene_rotation``). Per-key value shapes documented next to the
service-side validators.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: str | Sequence[str] | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column(
            "value",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "key", name="uq_user_preferences_user_id_key"),
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
