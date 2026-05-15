"""tracks table — user-uploaded music library

Revision ID: 0004_tracks
Revises: 0003
Create Date: 2026-05-14 02:00:00

Phase 6 Tier-2 (Track library + user upload).
  - tracks(id, title, artist?, mood, duration_ms?, file_key UQ,
           content_type, file_size_bytes, license?, uploaded_by_user_id FK,
           created_at, updated_at)

Hand-written (project convention) — autogenerate is unavailable in this
environment, and this matches the style of 20260514_0100_0003_equipment.py.

Renamed from "0004" → "0004_tracks" during rebase onto main because the
parallel Phase 4 PR also chose "0004"; merged with "0004" (rooms) via
0005_merge_rooms_tracks_heads.
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_tracks"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tracks",
        sa.Column("id", sa.String(36), primary_key=True),
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
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("artist", sa.String(255), nullable=True),
        sa.Column("mood", sa.String(32), nullable=False),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("file_key", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=False),
        sa.Column("license", sa.String(64), nullable=True),
        sa.Column("uploaded_by_user_id", sa.String(36), nullable=False),
        sa.UniqueConstraint("file_key", name="uq_tracks_file_key"),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            name="fk_tracks_uploaded_by_user_id_users",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_tracks_mood", "tracks", ["mood"])
    op.create_index(
        "ix_tracks_uploaded_by_user_id", "tracks", ["uploaded_by_user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_tracks_uploaded_by_user_id", table_name="tracks")
    op.drop_index("ix_tracks_mood", table_name="tracks")
    op.drop_table("tracks")
