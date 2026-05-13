from __future__ import annotations

from app.domain.models import User
from app.domain.services.strategies.compatibility import (
    CompatibilityScore,
    ICompatibilityStrategy,
)

_ROLE_AFFINITY = {
    ("UI 設計師", "前端工程師"): 12,
    ("作家", "小說作家"): 15,
    ("研究員", "資料科學家"): 14,
    ("音樂製作人", "插畫師"): 10,
    ("攝影師", "UI 設計師"): 8,
}


def _affinity(a: str | None, b: str | None) -> int:
    if not a or not b:
        return 0
    return _ROLE_AFFINITY.get((a, b)) or _ROLE_AFFINITY.get((b, a)) or 0


def _overlap_ratio(a: list[int], b: list[int]) -> float:
    """Jaccard-ish overlap on hour-of-day buckets (0-23)."""
    if not a or not b:
        return 0.0
    sa, sb = {h % 24 for h in a}, {h % 24 for h in b}
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


class SimpleOverlapStrategy(ICompatibilityStrategy):
    async def score(
        self,
        *,
        requester: User,
        candidate: User,
        requester_focus_starts: list[int],
        candidate_focus_starts: list[int],
    ) -> CompatibilityScore:
        overlap = _overlap_ratio(requester_focus_starts, candidate_focus_starts)
        affinity = _affinity(requester.role_label, candidate.role_label)
        base = int(round(overlap * 80)) + affinity + 5
        score = max(40, min(99, base))
        reason = (
            f"你們的專注時段重疊度 {int(overlap * 100)}%，"
            f"加上角色組合的隱性默契，今晚很可能合拍。"
        )
        return CompatibilityScore(score=score, reason=reason)
