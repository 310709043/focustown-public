from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import IIdGenerator
from app.domain.models.room_playback import RoomPlayback
from app.domain.repositories.room_playback_repo import IRoomPlaybackRepo
from app.infrastructure.db.models.room_playback import RoomPlaybackORM


def _to_domain(row: RoomPlaybackORM) -> RoomPlayback:
    return RoomPlayback(
        id=row.id,
        room_id=row.room_id,
        current_track_id=row.current_track_id,
        started_at_ms=row.started_at_ms,
        paused_at_ms=row.paused_at_ms,
        is_playing=row.is_playing,
    )


class SqlRoomPlaybackRepo(IRoomPlaybackRepo):
    """Postgres-backed playback repo.

    The ``upsert`` uses dialect-specific ``ON CONFLICT (room_id) DO
    UPDATE`` so concurrent owner retries (double-click on play) collapse
    to a single row deterministically. Tests use the in-memory
    ``FakeRoomPlaybackRepo`` which mirrors the same semantic without
    SQL.

    ``id_gen`` is injected so this repo can mint a fresh PK on first
    insert without leaking ID-generation policy into the service layer.
    """

    def __init__(self, session: AsyncSession, id_gen: IIdGenerator) -> None:
        self._s = session
        self._id_gen = id_gen

    async def get_by_room(self, room_id: str) -> RoomPlayback | None:
        stmt = select(RoomPlaybackORM).where(RoomPlaybackORM.room_id == room_id)
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def upsert(
        self,
        *,
        room_id: str,
        current_track_id: str | None,
        started_at_ms: int | None,
        paused_at_ms: int | None,
        is_playing: bool,
    ) -> RoomPlayback:
        # PG-specific upsert keyed by the unique room_id constraint.
        # ``id`` is only consumed when this is a fresh insert; on
        # conflict the existing row's id is kept (no churn for primary
        # key — important if any external consumer ever caches by id).
        stmt = (
            pg_insert(RoomPlaybackORM)
            .values(
                id=self._id_gen.new_id(),
                room_id=room_id,
                current_track_id=current_track_id,
                started_at_ms=started_at_ms,
                paused_at_ms=paused_at_ms,
                is_playing=is_playing,
            )
            .on_conflict_do_update(
                index_elements=["room_id"],
                set_=dict(
                    current_track_id=current_track_id,
                    started_at_ms=started_at_ms,
                    paused_at_ms=paused_at_ms,
                    is_playing=is_playing,
                ),
            )
            .returning(RoomPlaybackORM)
        )
        result = await self._s.execute(stmt)
        row = result.scalar_one()
        await self._s.refresh(row, ["updated_at"])
        return _to_domain(row)
