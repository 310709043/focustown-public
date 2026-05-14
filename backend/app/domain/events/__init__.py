"""Domain events — pure dataclasses dispatched via ``app.core.events.EventBus``.

Events are grouped by feature (one module per bounded context) so adding a
new event surface for a future feature (e.g. ``track.py`` for the upload
library) does not bloat a single module. This ``__init__`` re-exports them
so callers can keep writing ``from app.domain.events import X``.
"""

from __future__ import annotations

from app.domain.events.match import MatchAccepted, MatchProposed
from app.domain.events.session import (
    SessionAbandoned,
    SessionCompleted,
    SessionStarted,
)

__all__ = [
    "MatchAccepted",
    "MatchProposed",
    "SessionAbandoned",
    "SessionCompleted",
    "SessionStarted",
]
