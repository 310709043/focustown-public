from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

StationKind = Literal["city", "pair"]


@dataclass(slots=True, frozen=True)
class StationCursor:
    """Canonical cohort-station playhead — what's playing right now for everyone
    tuned in to this scope.

    Frozen because the service builds a new cursor on every advance and the
    cache/snapshot writer overwrites the row keyed by ``(kind, scope_id)``.
    Field mutation in place would obscure that contract.

    Wire format is epoch milliseconds so the frontend's drift loop matches
    ``Date.now()`` without timezone math; ``started_at_ms`` is the anchor
    that lets every client compute its own position from a single shared
    integer regardless of clock skew.
    """

    kind: StationKind
    scope_id: str
    playlist_ids: list[str]
    cursor_index: int
    started_at_ms: int
    seed: int
    version: int
