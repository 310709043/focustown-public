from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import IIdGenerator
from app.domain.models.station import StationCursor, StationKind
from app.domain.repositories.station_repo import IStationSnapshotRepo
from app.infrastructure.db.models.station import StationSnapshotORM


def _to_domain(row: StationSnapshotORM) -> StationCursor:
    return StationCursor(
        kind=row.kind,  # type: ignore[arg-type]
        scope_id=row.scope_id,
        playlist_ids=list(row.playlist_ids),
        cursor_index=row.cursor_index,
        started_at_ms=row.started_at_ms,
        seed=row.seed,
        version=row.version,
    )


class SqlStationSnapshotRepo(IStationSnapshotRepo):
    """Postgres-backed station snapshot repo.

    Upsert keyed on the (kind, scope_id) unique constraint so the worker's
    snapshot job is idempotent across overlapping runs. Mirrors
    SqlRoomPlaybackRepo's pattern.
    """

    def __init__(self, session: AsyncSession, id_gen: IIdGenerator) -> None:
        self._s = session
        self._id_gen = id_gen

    async def get_snapshot(
        self, *, kind: StationKind, scope_id: str
    ) -> StationCursor | None:
        stmt = select(StationSnapshotORM).where(
            StationSnapshotORM.kind == kind,
            StationSnapshotORM.scope_id == scope_id,
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def upsert_snapshot(self, cursor: StationCursor) -> None:
        stmt = (
            pg_insert(StationSnapshotORM)
            .values(
                id=self._id_gen.new_id(),
                kind=cursor.kind,
                scope_id=cursor.scope_id,
                playlist_ids=cursor.playlist_ids,
                cursor_index=cursor.cursor_index,
                started_at_ms=cursor.started_at_ms,
                seed=cursor.seed,
                version=cursor.version,
            )
            .on_conflict_do_update(
                index_elements=["kind", "scope_id"],
                set_=dict(
                    playlist_ids=cursor.playlist_ids,
                    cursor_index=cursor.cursor_index,
                    started_at_ms=cursor.started_at_ms,
                    seed=cursor.seed,
                    version=cursor.version,
                ),
            )
        )
        await self._s.execute(stmt)
