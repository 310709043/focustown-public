"""Extend wallet_transactions idempotency unique to cover gifts

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-20 00:00:00

Migration 0002 created a partial unique index
``ux_wallet_txn_idempotent`` over
``(user_id, currency_code, reason, ref_type, ref_id)`` that only
fires for ``reason IN ('session_complete', 'purchase')``. The
gift code path writes ``reason='gift_sent'`` and ``'gift_received'``
and was therefore unprotected — a double-click could duplicate the
transfer (security review 2026-05-20, domain agent P0 #2).

This migration widens the predicate to include both gift reasons.
The companion service change (``gift_service.gift`` now takes an
``idempotency_key`` parameter and uses it as ``ref_id`` for both
ledger halves) makes the constraint actually distinguish retries
from legitimate repeat gifts to the same recipient.

Forward / reverse are pure index swaps — no row-level migration
needed. If the dev DB happens to contain duplicate gift rows from
before this migration, the index creation will FAIL; clean them up
first with the same kind of one-shot SQL pattern used in PR #71's
``scripts/dedup-dev-tracks.sh``.
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | Sequence[str] | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_OLD_PRED = "reason IN ('session_complete', 'purchase')"
_NEW_PRED = (
    "reason IN ('session_complete', 'purchase', "
    "'gift_sent', 'gift_received')"
)


def upgrade() -> None:
    op.drop_index("ux_wallet_txn_idempotent", table_name="wallet_transactions")
    op.create_index(
        "ux_wallet_txn_idempotent",
        "wallet_transactions",
        ["user_id", "currency_code", "reason", "ref_type", "ref_id"],
        unique=True,
        postgresql_where=sa.text(_NEW_PRED),
    )


def downgrade() -> None:
    op.drop_index("ux_wallet_txn_idempotent", table_name="wallet_transactions")
    op.create_index(
        "ux_wallet_txn_idempotent",
        "wallet_transactions",
        ["user_id", "currency_code", "reason", "ref_type", "ref_id"],
        unique=True,
        postgresql_where=sa.text(_OLD_PRED),
    )
