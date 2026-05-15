"""focus_sessions compound index for daily-leaderboard query

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-17 01:00:00

The daily-leaderboard query (``IFocusSessionRepo.daily_leaderboard`` →
``SELECT user_id, COUNT(*) FROM focus_sessions WHERE status='COMPLETED'
AND mode='FOCUS' AND started_at >= :day_start GROUP BY user_id``) had no
covering index: the existing single-column indexes on ``user_id`` /
``partner_user_id`` don't help a planner that needs to scan by
``status`` + ``mode`` + ``started_at`` first.

Adding a compound index on ``(status, mode, started_at)`` turns the
sequential scan into an index range scan + grouping. The column order
puts the two equality predicates first and the range predicate last —
the standard "leftmost-prefix" pattern.

This is additive and non-blocking on dev volumes. For prod migrations
on large tables, switch to ``CREATE INDEX CONCURRENTLY`` (alembic
needs ``op.create_index(..., postgresql_concurrently=True)`` plus
running outside a transaction via ``op.execute(text("COMMIT"))`` first
— left for the prod deploy runbook, not the migration itself).
"""

from __future__ import annotations

from typing import Sequence

from alembic import op

revision: str = "0014"
down_revision: str | Sequence[str] | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_focus_sessions_status_mode_started_at",
        "focus_sessions",
        ["status", "mode", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_focus_sessions_status_mode_started_at", table_name="focus_sessions")
