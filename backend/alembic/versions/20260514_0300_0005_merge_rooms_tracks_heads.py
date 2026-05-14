"""merge rooms (0004) + tracks (0004_tracks) heads

Revision ID: 0005
Revises: 0004, 0004_tracks
Create Date: 2026-05-14 03:00:00

Empty merge revision combining the two parallel heads produced by:
  - Phase 4 (rooms table) — revision "0004"
  - Phase 6 Tier-2 (tracks table) — revision "0004_tracks"

No schema change here; this only reconciles the alembic version graph so
``alembic upgrade head`` resolves to a single tip.
"""
from __future__ import annotations

from typing import Sequence

revision: str = "0005"
down_revision: str | Sequence[str] | None = ("0004", "0004_tracks")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
