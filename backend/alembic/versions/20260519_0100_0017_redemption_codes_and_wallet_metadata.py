"""Redemption codes + wallet_transactions.metadata column

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-19 01:00:00

Two new tables for the T-coin redemption-code feature, plus a JSONB
``metadata`` column on ``wallet_transactions`` so domain events (gift
message, future session sequence number, etc.) can be persisted
alongside the ledger row without new tables. The metadata column is
nullable and never queried inside — no GIN index needed.

* ``redemption_codes`` — one row per code; codes can have an optional
  max-uses cap (NULL = unlimited within validity window) and an
  optional expiry window. ``UNIQUE(code)`` covers the redeem hot path
  ``WHERE code = $1``. A partial index on ``(is_active, valid_until)``
  is created lazily — at MVP volumes the unique-on-code lookup is
  sufficient.
* ``redemption_code_uses`` — append-only join row, one per (code,
  user). The ``UNIQUE(code_id, user_id)`` constraint makes the redeem
  operation idempotent per user (re-attempting raises a domain
  conflict instead of double-crediting).
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017"
down_revision: str | Sequence[str] | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "redemption_codes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("code", sa.String(length=40), nullable=False, unique=True),
        sa.Column("currency_code", sa.String(length=8), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("uses_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "valid_from",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "created_by",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
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
        sa.CheckConstraint("amount_minor > 0", name="redemption_codes_amount_positive"),
    )

    op.create_table(
        "redemption_code_uses",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "code_id",
            sa.String(length=36),
            sa.ForeignKey("redemption_codes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "used_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
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
        sa.UniqueConstraint(
            "code_id", "user_id", name="uq_redemption_code_uses_code_id_user_id"
        ),
    )
    op.create_index(
        "ix_redemption_code_uses_user_id_used_at",
        "redemption_code_uses",
        ["user_id", "used_at"],
    )

    op.add_column(
        "wallet_transactions",
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("wallet_transactions", "metadata")
    op.drop_index(
        "ix_redemption_code_uses_user_id_used_at",
        table_name="redemption_code_uses",
    )
    op.drop_table("redemption_code_uses")
    op.drop_table("redemption_codes")
