"""health_probe table for deep /ready write round-trip

Revision ID: 0027
Revises: 0026
Create Date: 2026-05-22 04:00:00

Phase 09 of the DB + Matching roadmap. ``/ready`` historically ran
``SELECT 1``; that proves the connection is alive but not that PG will
accept a write — read-replica failover, disk-full, and stuck
``BEGIN`` transactions all read fine but write 5xx. The deep ``/ready``
inserts a row into ``health_probe``, reads it back, then deletes it.
The DELETE keeps steady-state rows at zero; a uuid4 PK lets concurrent
LB health checks coexist.

The table is single-purpose — only ``/ready`` writes here, only
``/ready`` reads here. No FKs.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0027"
down_revision: str | Sequence[str] | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "health_probe",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "written_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("health_probe")
