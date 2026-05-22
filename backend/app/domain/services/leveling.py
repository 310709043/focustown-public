"""Pure helpers that turn cumulative focus-seconds into level + XP.

Kept framework-free so the same numbers can be reused by any caller
(stats endpoint today, achievement service tomorrow, leaderboard if we
ever expose levels there).
"""

from __future__ import annotations

SECONDS_PER_LEVEL = 25 * 3600  # 25 focus-hours per level
MAX_LEVEL = 20
XP_PER_LEVEL = 2000


def compute_level(total_focus_seconds: int) -> int:
    """Level grows by 1 for every 25 cumulative focus-hours, capped at 20."""
    base = total_focus_seconds // SECONDS_PER_LEVEL
    return max(1, min(MAX_LEVEL, base + 1))


def compute_xp(total_focus_seconds: int) -> int:
    """Progress within the current level, in [0, XP_PER_LEVEL)."""
    return (total_focus_seconds % SECONDS_PER_LEVEL) * XP_PER_LEVEL // SECONDS_PER_LEVEL
