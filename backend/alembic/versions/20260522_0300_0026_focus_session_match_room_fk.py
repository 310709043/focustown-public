"""focus_sessions.match_id + room_id FK columns

Revision ID: 0026
Revises: 0025
Create Date: 2026-05-22 03:00:00

Phase 07 ties focus sessions to the shared match-room they were started
inside. Both columns are nullable so existing solo sessions and the
legacy partnered path (which only writes ``partner_user_id``) remain
valid; new sessions started through the join-queue / room flow set
both so completion + leaderboard attribution can roll up at the
match-room level.

ON DELETE SET NULL is deliberate. Match rows can be admin-purged for
compliance reasons; the historical ``focus_sessions`` rows survive for
analytics and personal stats so the user doesn't lose their streak. The
NULL is interpretable: "this session was once part of a match-room, but
the match no longer exists."

The companion ``ix_focus_sessions_room_id`` accelerates the per-room
"how many minutes did this room rack up" queries Phase 08 will introduce
when sweeping abandoned rooms.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0026"
down_revision: str | Sequence[str] | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "focus_sessions",
        sa.Column(
            "match_id",
            sa.String(length=36),
            sa.ForeignKey("matches.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "focus_sessions",
        sa.Column(
            "room_id",
            sa.String(length=36),
            sa.ForeignKey("match_rooms.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_focus_sessions_room_id", "focus_sessions", ["room_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_focus_sessions_room_id", table_name="focus_sessions")
    op.drop_column("focus_sessions", "room_id")
    op.drop_column("focus_sessions", "match_id")
