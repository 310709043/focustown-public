"""Station snapshots (crash-recovery store for shared cohort cursors)

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-21 00:00:00

One row per active cohort station (city or pair). The live cursor lives
in Redis under ``station:{kind}:{scope_id}`` for low-latency fan-out;
this table is written every ~5 minutes by the worker so a Redis restart
can re-seed near the original playhead instead of resetting every
listener to a fresh shuffle.

UNIQUE(kind, scope_id) gives the upsert key. ``playlist_ids`` is JSONB
so a station's full ordering survives the snapshot — re-shuffling on
recovery would mid-song teleport everyone tuned in.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022"
down_revision: str | Sequence[str] | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "station_snapshots",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("scope_id", sa.String(length=64), nullable=False),
        sa.Column(
            "playlist_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("cursor_index", sa.Integer(), nullable=False),
        sa.Column("started_at_ms", sa.BigInteger(), nullable=False),
        sa.Column("seed", sa.BigInteger(), nullable=False),
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default="0",
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
        sa.UniqueConstraint("kind", "scope_id", name="uq_station_snapshots_kind_scope_id"),
    )


def downgrade() -> None:
    op.drop_table("station_snapshots")
