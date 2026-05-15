"""wallet, ledger, prices, user items

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-14 10:00:00

Phase 2: introduces the T-coin economy.
  - user_wallets       : per-user balance per currency
  - wallet_transactions: append-only ledger; partial unique index gives
                         idempotency for SessionCompleted awards & purchases
  - shop_item_prices   : multi-currency prices per shop item
  - user_items         : items the user has acquired (UNIQUE (user, item))

Hand-written (autogenerate doesn't know how to express the partial unique
index that backs idempotency).
"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── user_wallets ─────────────────────────────────────────────────────
    op.create_table(
        "user_wallets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency_code", sa.String(8), nullable=False),
        sa.Column("balance_minor", sa.BigInteger, nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "currency_code", name="uq_user_wallets_user_currency"),
        sa.CheckConstraint("balance_minor >= 0", name="ck_user_wallets_nonneg"),
    )
    op.create_index("ix_user_wallets_user_id", "user_wallets", ["user_id"])

    # ── wallet_transactions ─────────────────────────────────────────────
    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency_code", sa.String(8), nullable=False),
        sa.Column("delta_minor", sa.BigInteger, nullable=False),
        sa.Column("reason", sa.String(32), nullable=False),
        sa.Column("ref_type", sa.String(32), nullable=True),
        sa.Column("ref_id", sa.String(36), nullable=True),
        sa.Column("balance_after_minor", sa.BigInteger, nullable=False),
    )
    op.create_index(
        "ix_wallet_transactions_user_created",
        "wallet_transactions",
        ["user_id", "created_at"],
    )
    # Partial unique index: same (user, currency, reason, ref) can only post
    # once for "session_complete" or "purchase" → makes those reasons
    # idempotent without app-level locking.
    op.create_index(
        "ux_wallet_txn_idempotent",
        "wallet_transactions",
        ["user_id", "currency_code", "reason", "ref_type", "ref_id"],
        unique=True,
        postgresql_where=sa.text("reason IN ('session_complete', 'purchase')"),
    )

    # ── shop_item_prices ────────────────────────────────────────────────
    op.create_table(
        "shop_item_prices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "shop_item_id",
            sa.String(36),
            sa.ForeignKey("shop_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency_code", sa.String(8), nullable=False),
        sa.Column("amount_minor", sa.BigInteger, nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.UniqueConstraint(
            "shop_item_id",
            "currency_code",
            name="uq_shop_item_prices_item_currency",
        ),
        sa.CheckConstraint("amount_minor > 0", name="ck_shop_item_prices_positive"),
    )
    op.create_index("ix_shop_item_prices_shop_item_id", "shop_item_prices", ["shop_item_id"])

    # ── user_items ──────────────────────────────────────────────────────
    op.create_table(
        "user_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "shop_item_id",
            sa.String(36),
            sa.ForeignKey("shop_items.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("acquired_via", sa.String(16), nullable=False),
        sa.Column(
            "wallet_transaction_id",
            sa.String(36),
            sa.ForeignKey("wallet_transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint(
            "user_id", "shop_item_id", name="uq_user_items_user_item"
        ),
    )
    op.create_index("ix_user_items_user_id", "user_items", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_items_user_id", table_name="user_items")
    op.drop_table("user_items")
    op.drop_index("ix_shop_item_prices_shop_item_id", table_name="shop_item_prices")
    op.drop_table("shop_item_prices")
    op.drop_index("ux_wallet_txn_idempotent", table_name="wallet_transactions")
    op.drop_index("ix_wallet_transactions_user_created", table_name="wallet_transactions")
    op.drop_table("wallet_transactions")
    op.drop_index("ix_user_wallets_user_id", table_name="user_wallets")
    op.drop_table("user_wallets")
