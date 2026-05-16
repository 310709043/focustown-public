"""add users.cognito_sub for external auth provider mapping

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-16 04:00:00

Cognito tokens carry a `sub` claim that we need to map to our internal
users.id without rewriting every foreign key. Adding a UNIQUE NULL
column lets verify_access_token resolve sub → internal id with one
indexed lookup, and keeps the local_jwt path untouched (rows stay NULL).
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | Sequence[str] | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("cognito_sub", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint("uq_users_cognito_sub", "users", ["cognito_sub"])
    op.create_index("ix_users_cognito_sub", "users", ["cognito_sub"])


def downgrade() -> None:
    op.drop_index("ix_users_cognito_sub", table_name="users")
    op.drop_constraint("uq_users_cognito_sub", "users", type_="unique")
    op.drop_column("users", "cognito_sub")
