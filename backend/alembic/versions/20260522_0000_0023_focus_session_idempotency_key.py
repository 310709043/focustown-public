"""focus_sessions idempotency_key + body_hash columns

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-22 00:00:00

Phase 04 of the DB + Matching roadmap. The frontend client now
auto-attaches an ``Idempotency-Key`` header on every mutation; this
migration is the storage side of that contract for ``POST /sessions``.

Why two columns instead of one:
- ``idempotency_key`` is the dedup token; the partial unique index
  ``ux_focus_sessions_idem`` over ``(user_id, idempotency_key)`` makes
  a same-user retry return the existing row.
- ``idempotency_body_hash`` lets the service distinguish a *retry of
  the same request* from *a different request that reused the key by
  mistake*. Same key + same body → 200 with the original session;
  same key + different body → 409 ``idempotency_conflict``.

The index predicate skips ``NULL`` keys so all the pre-Phase 04 rows
(and any future caller that genuinely opts out of dedup) coexist with
the indexed rows.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023a"
down_revision: str | Sequence[str] | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "focus_sessions",
        sa.Column("idempotency_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "focus_sessions",
        sa.Column("idempotency_body_hash", sa.Text(), nullable=True),
    )
    op.create_index(
        "ux_focus_sessions_idem",
        "focus_sessions",
        ["user_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ux_focus_sessions_idem", table_name="focus_sessions")
    op.drop_column("focus_sessions", "idempotency_body_hash")
    op.drop_column("focus_sessions", "idempotency_key")
