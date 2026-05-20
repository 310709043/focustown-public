from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass

from app.core.clock import IClock
from app.core.exceptions import BusinessError
from app.domain.models.station import StationCursor, StationKind
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.station_repo import (
    IStationReader,
    IStationWriter,
)
from app.domain.repositories.track_repo import ITrackRepo
from app.infrastructure.cache.station_cache import RedisStationCache

DEFAULT_TRACK_DURATION_MS = 180_000  # 3 min — fallback when track has no duration


@dataclass(slots=True)
class StationService:
    """Cohort-shared playback station (Phase 10 — connection feature).

    SOLID:
    - S: only owns the canonical cursor (which song, anchored when) for a
      shared cohort. Track storage, streaming, and per-user shuffle stay in
      ``ITrackRepo`` / ``PlaylistService``.
    - O: a new station kind (e.g. ``"region"``) is a literal addition plus
      a worker job; the timeline math is unchanged.
    - L: depends on the same ``ITrackRepo`` / ``IClock`` / ``IRealtimePublisher``
      Protocols other services use; their fakes apply here unchanged.
    - I: snapshot deps narrowed to Reader / Writer (ISP-split per
      ``station_repo.py``).
    - D: framework-free; tests use ``FakeClock`` + ``fakeredis`` + recorded
      publisher.

    Timeline math (epoch milliseconds, source of truth for drift):
    - ``seed()``: deterministic shuffle by (kind, scope_id, day). NO
      user_id in the seed — the whole population must agree on order.
    - ``advance_if_due()``: when ``now_ms >= started_at_ms + duration``,
      advance the cursor. Carries the *exact* duration into the new
      ``started_at_ms`` rather than re-anchoring to ``now_ms``, so a late
      tick (worker ran 4s behind) does not drift the shared playhead.
    - ``cleanup_pair()``: explicit delete when both pair-mates' sessions
      end; Redis 6h TTL is the safety net for sessions that crash without
      a proper end.

    Listeners compute their playback offset on the client from
    ``started_at_ms`` only — server clock skew never makes different users
    hear different songs because the publisher's ``started_at_ms`` is the
    wire truth.
    """

    cache: RedisStationCache
    snapshots_reader: IStationReader
    snapshots_writer: IStationWriter
    tracks: ITrackRepo
    realtime: IRealtimePublisher
    clock: IClock

    def _now_ms(self) -> int:
        return int(self.clock.now().timestamp() * 1000)

    def _day(self) -> str:
        return self.clock.now().date().isoformat()

    @staticmethod
    def _seed_int(*, kind: StationKind, scope_id: str, day: str) -> int:
        material = f"{kind}|{scope_id}|{day}".encode()
        digest = hashlib.sha256(material).digest()
        return int.from_bytes(digest[:8], byteorder="big")

    async def get_current(
        self, *, kind: StationKind, scope_id: str
    ) -> StationCursor:
        """Redis → DB snapshot → fresh seed. Always returns a cursor."""
        cached = await self.cache.get(kind=kind, scope_id=scope_id)
        if cached is not None:
            return cached
        snapshot = await self.snapshots_reader.get_snapshot(
            kind=kind, scope_id=scope_id
        )
        if snapshot is not None:
            await self.cache.set(snapshot)
            return snapshot
        return await self.seed(kind=kind, scope_id=scope_id)

    async def seed(
        self, *, kind: StationKind, scope_id: str
    ) -> StationCursor:
        """Build a fresh cursor at index 0 anchored to now.

        Deterministic per (kind, scope_id, day) so any process seeding the
        same station the same day produces the same ordering — important
        when a Redis cold-start re-seeds while listeners are mid-song; the
        ordering stays identical, only the cursor advances.
        """
        catalog = await self.tracks.list_official()
        if not catalog:
            raise BusinessError("no_tracks_available")
        seed = self._seed_int(kind=kind, scope_id=scope_id, day=self._day())
        ids = [t.id for t in catalog]
        # ``random.Random`` is the right call here: we need a
        # reproducible per-(kind, scope, day) shuffle, not crypto
        # randomness. Suppress S311 explicitly.
        random.Random(seed).shuffle(ids)  # noqa: S311
        cursor = StationCursor(
            kind=kind,
            scope_id=scope_id,
            playlist_ids=ids,
            cursor_index=0,
            started_at_ms=self._now_ms(),
            seed=seed,
            version=0,
        )
        await self.cache.set(cursor)
        await self.realtime.publish(
            IRealtimePublisher.station_channel(kind, scope_id),
            self._wire_payload(cursor),
        )
        return cursor

    async def advance_if_due(
        self, *, kind: StationKind, scope_id: str, now_ms: int
    ) -> StationCursor | None:
        """Advance the cursor when the current track is over; else no-op.

        Returns the new cursor on advance, ``None`` when the current track
        is still playing. Publishes a ``station.cursor`` event on advance.
        """
        cursor = await self.get_current(kind=kind, scope_id=scope_id)
        track_id = cursor.playlist_ids[cursor.cursor_index]
        track = await self.tracks.get(track_id)
        duration_ms = (
            track.duration_ms
            if track is not None and track.duration_ms is not None
            else DEFAULT_TRACK_DURATION_MS
        )
        track_end_ms = cursor.started_at_ms + duration_ms
        if now_ms < track_end_ms:
            return None

        # Carry the exact duration into started_at_ms so late ticks don't
        # drift. If we ran > 2 tracks behind (Redis was paused, worker
        # restart), advance multiple steps in one tick.
        new_started = cursor.started_at_ms + duration_ms
        new_index = (cursor.cursor_index + 1) % len(cursor.playlist_ids)
        advanced = StationCursor(
            kind=cursor.kind,
            scope_id=cursor.scope_id,
            playlist_ids=cursor.playlist_ids,
            cursor_index=new_index,
            started_at_ms=new_started,
            seed=cursor.seed,
            version=cursor.version + 1,
        )
        await self.cache.set(advanced)
        await self.realtime.publish(
            IRealtimePublisher.station_channel(advanced.kind, advanced.scope_id),
            self._wire_payload(advanced),
        )
        return advanced

    async def snapshot_to_db(
        self, *, kind: StationKind, scope_id: str
    ) -> None:
        cursor = await self.cache.get(kind=kind, scope_id=scope_id)
        if cursor is None:
            return
        await self.snapshots_writer.upsert_snapshot(cursor)

    async def cleanup_pair(self, *, match_id: str) -> None:
        """Explicit teardown when both pair-mates' sessions end.

        The 6h Redis TTL is the safety net for crashed sessions; this is
        the happy-path cleanup so the next match on the same id doesn't
        inherit stale state.
        """
        await self.cache.delete(kind="pair", scope_id=match_id)

    @staticmethod
    def _wire_payload(cursor: StationCursor) -> dict[str, object]:
        return {
            "type": "station.cursor",
            "kind": cursor.kind,
            "scope_id": cursor.scope_id,
            "playlist_ids": cursor.playlist_ids,
            "cursor_index": cursor.cursor_index,
            "started_at_ms": cursor.started_at_ms,
            "version": cursor.version,
        }
