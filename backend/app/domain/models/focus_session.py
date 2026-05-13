from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class FocusSessionMode(StrEnum):
    FOCUS = "focus"
    SHORT_BREAK = "short"
    LONG_BREAK = "long"


class FocusSessionStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    CANCELLED = "cancelled"


_MODE_DEFAULT_SECONDS = {
    FocusSessionMode.FOCUS: 25 * 60,
    FocusSessionMode.SHORT_BREAK: 5 * 60,
    FocusSessionMode.LONG_BREAK: 15 * 60,
}


def default_duration(mode: FocusSessionMode) -> int:
    return _MODE_DEFAULT_SECONDS[mode]


@dataclass(slots=True)
class FocusSession:
    id: str
    user_id: str
    partner_user_id: str | None
    mode: FocusSessionMode
    duration_seconds: int
    elapsed_seconds: int
    status: FocusSessionStatus
    task_label: str | None
    started_at: datetime
    ended_at: datetime | None

    @property
    def remaining_seconds(self) -> int:
        return max(0, self.duration_seconds - self.elapsed_seconds)

    def can_transition_to(self, new_status: FocusSessionStatus) -> bool:
        if self.status is not FocusSessionStatus.ACTIVE:
            return False
        return new_status in {
            FocusSessionStatus.COMPLETED,
            FocusSessionStatus.ABANDONED,
            FocusSessionStatus.CANCELLED,
        }
