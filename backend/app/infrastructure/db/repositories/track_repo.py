from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.track_repo import ITrackRepo, TrackRecord
from app.infrastructure.db.models.track import TrackORM


def _to_record(row: TrackORM) -> TrackRecord:
    return TrackRecord(
        id=row.id,
        title=row.title,
        artist=row.artist,
        mood=row.mood,
        duration_ms=row.duration_ms,
        file_key=row.file_key,
        content_type=row.content_type,
        file_size_bytes=row.file_size_bytes,
        license=row.license,
        uploaded_by_user_id=row.uploaded_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_official=row.is_official,
    )


class SqlTrackRepo(ITrackRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list(self, *, mood: str | None = None) -> list[TrackRecord]:
        stmt = select(TrackORM).order_by(TrackORM.created_at.desc())
        if mood is not None:
            stmt = stmt.where(TrackORM.mood == mood)
        return [_to_record(r) for r in (await self._s.execute(stmt)).scalars().all()]

    async def list_official(self) -> list[TrackRecord]:
        stmt = (
            select(TrackORM)
            .where(TrackORM.is_official.is_(True))
            .order_by(TrackORM.id.asc())
        )
        return [_to_record(r) for r in (await self._s.execute(stmt)).scalars().all()]

    async def get(self, track_id: str) -> TrackRecord | None:
        row = await self._s.get(TrackORM, track_id)
        return _to_record(row) if row else None

    async def get_many_by_ids(self, track_ids: list[str]) -> list[TrackRecord]:
        if not track_ids:
            return []
        stmt = select(TrackORM).where(TrackORM.id.in_(track_ids))
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_record(r) for r in rows]

    async def insert(
        self,
        *,
        track_id: str,
        title: str,
        artist: str | None,
        mood: str,
        duration_ms: int | None,
        file_key: str,
        content_type: str,
        file_size_bytes: int,
        license: str | None,
        uploaded_by_user_id: str,
        is_official: bool = False,
    ) -> TrackRecord:
        row = TrackORM(
            id=track_id,
            title=title,
            artist=artist,
            mood=mood,
            duration_ms=duration_ms,
            file_key=file_key,
            content_type=content_type,
            file_size_bytes=file_size_bytes,
            license=license,
            uploaded_by_user_id=uploaded_by_user_id,
            is_official=is_official,
        )
        self._s.add(row)
        await self._s.flush()
        return _to_record(row)
