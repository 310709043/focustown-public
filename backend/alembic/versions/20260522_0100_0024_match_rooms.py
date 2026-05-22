"""match_rooms table — shared focus-room lifecycle

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-22 01:00:00

Phase 07 of the DB + Matching roadmap. ``match_rooms`` is the server-side
projection of "this accepted match has a shared focus room two users meet
in". Distinct from the existing ``rooms`` table (owner-rooms; the
permanent decor room on a user's profile) — these rows are transient,
two-participant, and end the moment both partners leave or both
sessions complete.

Why unique on ``match_id``: one match → at most one room. The match's
``id`` is the natural dedup key; ``MatchingService.accept`` is wrapped in
an advisory lock + this UNIQUE acts as the SQL-level belt-and-suspenders
so two parallel accepts can't double-insert (the lock prevents the read
race; the unique stops a double-INSERT in the unlikely event the lock
fails or is bypassed).

The status string is the lifecycle state machine: ``open`` (created,
nobody joined yet) → ``both_joined`` (both participants have set
joined_at) → ``active`` (Phase 08 will flip this when the timer starts)
→ ``ended`` (terminal). Phase 08 also adds the room-timeout sweep that
transitions stale ``open`` rooms straight to ``ended`` with
``ended_reason='timeout'``.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024"
# Merge point for the two parallel 0023 branches:
# - "0023_match_pool" is ``match_waiting_pool`` (Phase 06; renumbered by
#   Phase 02's pagination PR to disambiguate the duplicate "0023" id
#   Phase 04 + Phase 06 originally collided on).
# - "0023a" is ``focus_session_idempotency_key`` (Phase 04; renumbered
#   by Phase 07 for the same reason).
# 0024 doubles as the merge node *and* the match_rooms creation so we
# don't pay for an empty merge-only revision file.
down_revision: str | Sequence[str] | None = ("0023_match_pool", "0023a")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "match_rooms",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "match_id",
            sa.String(length=36),
            sa.ForeignKey("matches.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="open",
        ),  # open | both_joined | active | ended
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_reason", sa.String(length=32), nullable=True),
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


def downgrade() -> None:
    op.drop_table("match_rooms")
