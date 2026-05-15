"""personal radio (tracks.is_official) + shared notes (notes.shared_in_match_id)

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-16 03:00:00

Two additive columns:

- ``tracks.is_official`` flags team-curated rows. The personal-radio
  endpoint (``GET /api/v1/playback/playlist``) only draws from rows
  where this is ``TRUE``; user-uploaded rows stay where they were and
  are unaffected. ``uploaded_by_user_id`` remains NOT NULL — official
  rows are owned by a system user inserted via the seed.

- ``notes.shared_in_match_id`` lets the matched-focus-room notepad
  expose a private/shared toggle. ``NULL`` = private (existing
  semantic, unchanged for legacy rows). ``ON DELETE SET NULL`` so a
  closed match silently demotes shared notes back to private rather
  than deleting the user's writing.

Both are NULL-safe / default-safe for existing rows, so no data
migration is needed.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tracks",
        sa.Column(
            "is_official",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index(
        "ix_tracks_is_official",
        "tracks",
        ["is_official"],
        postgresql_where=sa.text("is_official = TRUE"),
    )

    op.add_column(
        "notes",
        sa.Column("shared_in_match_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_notes_shared_in_match_id_matches",
        "notes",
        "matches",
        ["shared_in_match_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_notes_shared_in_match_id",
        "notes",
        ["shared_in_match_id"],
        postgresql_where=sa.text("shared_in_match_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_notes_shared_in_match_id", table_name="notes")
    op.drop_constraint(
        "fk_notes_shared_in_match_id_matches", "notes", type_="foreignkey"
    )
    op.drop_column("notes", "shared_in_match_id")
    op.drop_index("ix_tracks_is_official", table_name="tracks")
    op.drop_column("tracks", "is_official")
