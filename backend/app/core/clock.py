from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol


class IClock(Protocol):
    def now(self) -> datetime: ...


class SystemClock(IClock):
    def now(self) -> datetime:
        return datetime.now(UTC)
