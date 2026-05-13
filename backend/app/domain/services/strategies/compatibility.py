from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.domain.models import User


@dataclass(slots=True)
class CompatibilityScore:
    score: int  # 0..100
    reason: str


class ICompatibilityStrategy(Protocol):
    """Open-Closed: pluggable scoring algorithm.

    MVP impl: SimpleOverlapStrategy (overlap of recent focus windows + role affinity).
    v2: MLCompatibilityStrategy (embeddings + collaborative filtering).
    """

    async def score(
        self,
        *,
        requester: User,
        candidate: User,
        requester_focus_starts: list[int],
        candidate_focus_starts: list[int],
    ) -> CompatibilityScore: ...
