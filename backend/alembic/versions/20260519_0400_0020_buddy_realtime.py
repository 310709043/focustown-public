"""Buddy room chat + shared agenda tables

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-19 04:00:00

Two new tables for the buddy (matched-focus) realtime experience:

* ``match_messages`` — append-only chat scrollback. The
  ``(match_id, created_at DESC)`` index covers the only access
  pattern ("recent messages in this room"). ``metadata`` JSONB
  carries note quotes / attachment refs without a separate table.
* ``match_agenda_items`` — collaborative checklist. ``position``
  controls ordering; ``status`` carries pending / in_progress / done.

Why persisted (vs WS-transient): late joiners need scrollback,
abuse review needs an audit trail, and the agenda is editable by
both peers — it can't live purely in WS state without losing on
disconnect.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | Sequence[str] | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "match_messages",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "match_id",
            sa.String(length=36),
            sa.ForeignKey("matches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.String(length=16),
            nullable=False,
            server_default="text",
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
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
    )
    op.create_index(
        "ix_match_messages_match_id_created_at",
        "match_messages",
        ["match_id", "created_at"],
    )

    op.create_table(
        "match_agenda_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "match_id",
            sa.String(length=36),
            sa.ForeignKey("matches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "created_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "checked_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
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
    )
    op.create_index(
        "ix_match_agenda_items_match_id_position",
        "match_agenda_items",
        ["match_id", "position"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_match_agenda_items_match_id_position",
        table_name="match_agenda_items",
    )
    op.drop_table("match_agenda_items")
    op.drop_index(
        "ix_match_messages_match_id_created_at",
        table_name="match_messages",
    )
    op.drop_table("match_messages")
