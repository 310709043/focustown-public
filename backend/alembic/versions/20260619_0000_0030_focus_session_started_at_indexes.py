"""Add indexes on focus_sessions.started_at for user-stats and admin queries

Revision ID: 0030
Revises: 0029
Create Date: 2026-06-19 00:00:00

The existing compound index ``ix_focus_sessions_status_mode_started_at``
(0014) covers the daily-leaderboard query but NOT:

- **User stats** queries that filter ``WHERE user_id = X AND started_at >= T``
  (``user_totals``, ``weekly_rank``, ``weekly_heatmap``) — these need
  ``(user_id, started_at)`` to avoid scanning the full ``user_id`` index
  then filtering by date.

- **Admin session listing** that sorts ``ORDER BY started_at DESC`` or
  filters ``WHERE date(started_at) = :today`` without a ``status`` prefix —
  the composite index's leftmost column (``status``) can't be skipped.

Both indexes are additive and non-blocking on dev volumes.
"""

from __future__ import annotations

from typing import Sequence

from alembic import op

revision: str = "0030"
down_revision: str | Sequence[str] | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_focus_sessions_user_started_at",
        "focus_sessions",
        ["user_id", "started_at"],
    )
    op.create_index(
        "ix_focus_sessions_started_at",
        "focus_sessions",
        ["started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_focus_sessions_started_at", table_name="focus_sessions")
    op.drop_index("ix_focus_sessions_user_started_at", table_name="focus_sessions")
