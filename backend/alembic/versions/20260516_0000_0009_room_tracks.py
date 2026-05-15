"""room_tracks — per-room playlist association

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-16 00:00:00

Phase 7: persistent ordered association between a user's room and tracks
from the global library. ``position`` lets the playlist preserve order
without forcing serialization on inserts; the UNIQUE ``(room_id, track_id)``
makes duplicate adds idempotent (raises IdempotencyViolationError).

Both FKs cascade-delete: removing a room or a track cleans up the join.

Hand-written; autogenerate sometimes mangles composite indexes.

Rebased: ``down_revision`` was originally ``"0007"`` per the pre-rebase
ledger; Lane A's ``0008_room_items`` shipped first (PR #12), so this
now chains off ``"0008"``.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "room_tracks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column("track_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
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
            name="fk_room_tracks_room_id_rooms",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["track_id"],
            ["tracks.id"],
            name="fk_room_tracks_track_id_tracks",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_room_tracks"),
        sa.UniqueConstraint(
            "room_id", "track_id", name="uq_room_tracks_room_id_track_id"
        ),
    )
    op.create_index(
        "ix_room_tracks_room_id_position",
        "room_tracks",
        ["room_id", "position"],
    )


def downgrade() -> None:
    op.drop_index("ix_room_tracks_room_id_position", table_name="room_tracks")
    op.drop_table("room_tracks")
