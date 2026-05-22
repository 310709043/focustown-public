"""merge Phase 04 + Phase 06 heads

Revision ID: 0024
Revises: 0023, 0023_match_pool
Create Date: 2026-05-22 01:00:00

Phase 04 (PR #123) and Phase 06 (PR #124) each shipped a migration
labelled ``revision = "0023"`` and pointing at ``0022`` as parent. The
two develop merges did not produce a merge migration, leaving the
alembic history with two heads — ``alembic upgrade head`` then refuses
to choose between them.

The Phase 06 migration is renamed in this branch from ``0023`` to
``0023_match_pool`` so the two branches can coexist. This empty merge
joins them so ``upgrade head`` resolves to a single tip. No DDL — only
graph topology.
"""
from __future__ import annotations

from collections.abc import Sequence

revision: str = "0024"
down_revision: tuple[str, str] = ("0023", "0023_match_pool")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
