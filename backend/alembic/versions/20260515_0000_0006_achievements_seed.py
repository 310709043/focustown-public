"""achievements seed — populate the 3 MVP badges

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-15 00:00:00

Inserts the three achievement rows that AchievementService grants on
SessionCompleted (``streak_7``, ``sprint_15``, ``night_owl``). The codes
must match the literals in ``app/domain/services/achievement_service.py``;
the seed exists so that newly-deployed environments and CI have rows for
``UserAchievementORM.achievement_code`` to reference.

Hardcoded UUIDs are intentional — ``downgrade`` deletes by ``code`` so the
ids aren't actually load-bearing, but a stable id is convenient if we
ever need to backfill or reference rows by primary key in admin tooling.
"""
from __future__ import annotations

from typing import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_SEED_ROWS = (
    (
        "01000000-0000-4000-8000-000000000001",
        "streak_7",
        "🔥",
        "7-Day Streak",
        "Complete focus sessions on 7 different days",
    ),
    (
        "01000000-0000-4000-8000-000000000002",
        "sprint_15",
        "⚡",
        "Sprint 15",
        "Complete 15 focus sessions in a single day",
    ),
    (
        "01000000-0000-4000-8000-000000000003",
        "night_owl",
        "🌙",
        "Night Owl",
        "Complete a focus session between 10 PM and 6 AM",
    ),
)


def upgrade() -> None:
    for row_id, code, icon, title, description in _SEED_ROWS:
        op.execute(
            f"INSERT INTO achievements (id, code, icon, title, description) "
            f"VALUES ('{row_id}', '{code}', '{icon}', '{title}', "
            f"'{description.replace(chr(39), chr(39) * 2)}')"
        )


def downgrade() -> None:
    codes = ", ".join(f"'{row[1]}'" for row in _SEED_ROWS)
    op.execute(f"DELETE FROM achievements WHERE code IN ({codes})")
