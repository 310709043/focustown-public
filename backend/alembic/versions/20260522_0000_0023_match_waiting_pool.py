"""Match waiting pool (PG source of truth for the queue)

Revision ID: 0023_match_pool
Revises: 0022
Create Date: 2026-05-22 00:00:00

Renamed from ``0023`` to ``0023_match_pool`` during the Phase 02 merge
so it can coexist with the Phase 04 ``0023`` (focus_session
idempotency, in ``0023_focus_session_idempotency_key.py``). A follow-up
merge migration ``0024`` joins both heads. Once develop unifies the two
``0023``s upstream this rename can be reverted.

Until now the matching waiting pool lived only in Redis (see
``app/infrastructure/matching/redis_queue.py``). A Redis restart with no
persistence — Lightsail's default — silently dropped every waiter and
left the user stuck in the matching modal with no way to debug the
disappearance after the fact.

This table promotes Postgres to source of truth for the queue. Redis
remains as a fast secondary index (ZSET + HASH); a reconciliation tick
re-warms Redis from PG within 30s of any drift, and worker boot warms
Redis from PG before the sweep starts ticking.

Schema notes:

* ``user_id`` is PK — one row per user; re-enqueue after cancel updates
  the same row (the SQL repo uses ``ON CONFLICT DO UPDATE``).
* ``status`` is a short tag: ``waiting`` | ``paired`` | ``cancelled``
  | ``bot_fallback``. ``bot_fallback`` is terminal — the reconciler must
  not re-enqueue a row in that state even if the Redis side has been
  flushed.
* ``ix_match_waiting_pool_status_enqueued`` supports the "list active
  waiters ordered by enqueue time" scan used by both the boot warm-up
  and the periodic reconciliation tick.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023_match_pool"
down_revision: str | Sequence[str] | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "match_waiting_pool",
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="waiting",
        ),
        sa.Column("enqueued_at_ms", sa.BigInteger(), nullable=False),
        sa.Column("fallback_deadline_ms", sa.BigInteger(), nullable=False),
        sa.Column("match_id", sa.String(length=36), nullable=True),
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
    op.create_index(
        "ix_match_waiting_pool_status_enqueued",
        "match_waiting_pool",
        ["status", "enqueued_at_ms"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_match_waiting_pool_status_enqueued", table_name="match_waiting_pool"
    )
    op.drop_table("match_waiting_pool")
