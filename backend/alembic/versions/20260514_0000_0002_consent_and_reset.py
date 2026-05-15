"""consent fields + password reset tokens

Revision ID: 0002_consent
Revises: 0001
Create Date: 2026-05-14 00:00:00

Renamed from ``revision = "0002"`` to ``"0002_consent"`` to resolve a
duplicate-revision collision with ``20260514_0000_0002_wallet_and_items``
(both ship as Phase-2 work). The two siblings now merge implicitly at
``0003.down_revision = ("0002", "0002_consent")``.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_consent"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("terms_version", sa.String(16), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "marketing_opt_in",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column("marketing_opt_in_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(64), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_password_reset_tokens_token_hash"),
    )
    op.create_index(
        "ix_password_reset_tokens_user_id",
        "password_reset_tokens",
        ["user_id"],
    )
    op.create_index(
        "ix_password_reset_tokens_active",
        "password_reset_tokens",
        ["user_id"],
        postgresql_where=sa.text("consumed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_active", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_column("users", "marketing_opt_in_at")
    op.drop_column("users", "marketing_opt_in")
    op.drop_column("users", "terms_version")
    op.drop_column("users", "terms_accepted_at")
