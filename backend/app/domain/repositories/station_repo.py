from __future__ import annotations

from typing import Protocol

from app.domain.models.station import StationCursor, StationKind


class IStationReader(Protocol):
    """Read-only access to persisted station snapshots.

    Used by ``StationService.get_current`` as the fallback after a Redis
    miss (cold start, eviction, crash recovery). Snapshots lag the live
    cursor by up to one snapshot interval (~5 min); the service re-anchors
    ``started_at_ms`` against the wall clock before publishing.
    """

    async def get_snapshot(
        self, *, kind: StationKind, scope_id: str
    ) -> StationCursor | None: ...


class IStationWriter(Protocol):
    """Snapshot-write side for crash recovery.

    Single upsert entry point keyed on (kind, scope_id). The worker
    snapshots every active station every ~5 minutes; this is the only
    durable path for the cursor (Redis is source-of-truth for the live
    timeline).
    """

    async def upsert_snapshot(self, cursor: StationCursor) -> None: ...


class IStationSnapshotRepo(IStationReader, IStationWriter, Protocol):
    """Full station snapshot repository — composes reader + writer.

    Callers that need both sides (the snapshot worker) depend on this;
    everything else narrows per ISP.
    """
