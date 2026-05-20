from __future__ import annotations

import json
from collections.abc import AsyncIterator

from redis.asyncio import Redis

from app.domain.models.station import StationCursor, StationKind


def _key(kind: StationKind, scope_id: str) -> str:
    return f"station:{kind}:{scope_id}"


class RedisStationCache:
    """Redis-backed live cursor for cohort stations.

    This is the source-of-truth for the live playhead: worker reads it,
    advances it, writes it back, and publishes a ``station.cursor`` event.
    The Postgres snapshot table is recovery-only.

    City keys carry no TTL (the city never goes away); pair keys carry a
    sliding 6h TTL refreshed on each ``set`` so abandoned matches GC
    themselves without a sweep job.
    """

    PAIR_TTL_SECONDS = 6 * 60 * 60  # 6h sliding

    def __init__(self, redis: Redis) -> None:
        self._r = redis

    async def get(
        self, *, kind: StationKind, scope_id: str
    ) -> StationCursor | None:
        raw = await self._r.get(_key(kind, scope_id))
        if raw is None:
            return None
        data = json.loads(raw)
        return StationCursor(
            kind=data["kind"],
            scope_id=data["scope_id"],
            playlist_ids=list(data["playlist_ids"]),
            cursor_index=int(data["cursor_index"]),
            started_at_ms=int(data["started_at_ms"]),
            seed=int(data["seed"]),
            version=int(data["version"]),
        )

    async def set(self, cursor: StationCursor) -> None:
        payload = json.dumps(
            {
                "kind": cursor.kind,
                "scope_id": cursor.scope_id,
                "playlist_ids": cursor.playlist_ids,
                "cursor_index": cursor.cursor_index,
                "started_at_ms": cursor.started_at_ms,
                "seed": cursor.seed,
                "version": cursor.version,
            }
        )
        ttl = self.PAIR_TTL_SECONDS if cursor.kind == "pair" else None
        if ttl is None:
            await self._r.set(_key(cursor.kind, cursor.scope_id), payload)
        else:
            await self._r.set(_key(cursor.kind, cursor.scope_id), payload, ex=ttl)

    async def delete(self, *, kind: StationKind, scope_id: str) -> None:
        await self._r.delete(_key(kind, scope_id))

    async def scan_pair_keys(self) -> AsyncIterator[str]:
        """Yield each live pair-station Redis key.

        Used by the worker's ``advance_pair_stations`` job to find scopes
        that need a cursor advance. SCAN (not KEYS) so we don't block the
        Redis event loop on large keyspaces.
        """
        async for key in self._r.scan_iter(match="station:pair:*"):
            yield key
