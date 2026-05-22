"""room_participants table — one row per (room, user)

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-22 02:00:00

Companion to ``match_rooms`` from migration 0024. Each accepted match
materialises exactly two rows here — one per participant — when
``MatchRoomService.ensure_room_for_match`` runs inside the
``MatchingService.accept`` advisory lock.

Composite primary key ``(room_id, user_id)`` is the natural dedup key
for the bulk INSERT path; ``pg_insert(...).on_conflict_do_nothing`` on
this PK is what makes the room-creation step idempotent under concurrent
accepts. A separate ``ix_room_participants_user_id`` supports the
"what rooms am I in?" lookup used by the join/leave endpoints when
the only thing the caller has is their own ``user_id``.

``focus_session_id`` is set lazily by ``MatchRoomService.link_session``
(Phase 08 will own that wiring); the SET NULL on delete preserves
historical room data when an admin / GDPR delete removes a focus_session
row.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0025"
down_revision: str | Sequence[str] | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "room_participants",
        sa.Column(
            "room_id",
            sa.String(length=36),
            sa.ForeignKey("match_rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=16), nullable=False),  # requester | candidate
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "focus_session_id",
            sa.String(length=36),
            sa.ForeignKey("focus_sessions.id", ondelete="SET NULL"),
            nullable=True,
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
        sa.PrimaryKeyConstraint("room_id", "user_id", name="pk_room_participants"),
    )
    op.create_index(
        "ix_room_participants_user_id",
        "room_participants",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_room_participants_user_id", table_name="room_participants")
    op.drop_table("room_participants")
