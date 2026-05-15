"""room_playback — per-room shared playback timeline

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-16 02:00:00

One row per room — kept in a separate table from ``rooms`` because:
  1. play/pause/seek mutations churn this row constantly; isolating
     them keeps ``rooms.updated_at`` honest for unrelated readers.
  2. CASCADE on ``room_id`` makes the lifecycle explicit (delete the
     room → wipe its playback).
  3. UNIQUE(room_id) enforces the "one timeline per room" invariant
     at the DB level so even concurrent ``play()`` retries can't fork.

Timeline fields are millisecond epochs (BIGINT) — chosen over
``TIMESTAMP`` so the frontend can do drift math with ``Date.now()``
without timezone juggling. ``current_track_id`` FK is SET NULL on
track deletion (a deleted-from-library track shouldn't kill the
playback row; the owner can pick a new one).

Hand-written (no autogen) per the parallel-migration-ledger discipline.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | Sequence[str] | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "room_playback",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("room_id", sa.String(length=36), nullable=False),
        sa.Column(
            "current_track_id",
            sa.String(length=36),
            nullable=True,
        ),
        sa.Column("started_at_ms", sa.BigInteger(), nullable=True),
        sa.Column("paused_at_ms", sa.BigInteger(), nullable=True),
        sa.Column(
            "is_playing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
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
            name="fk_room_playback_room_id_rooms",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["current_track_id"],
            ["tracks.id"],
            name="fk_room_playback_current_track_id_tracks",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_room_playback"),
        sa.UniqueConstraint(
            "room_id", name="uq_room_playback_room_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("room_playback")
