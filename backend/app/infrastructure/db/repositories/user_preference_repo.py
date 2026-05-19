from __future__ import annotations

from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.user_preference_repo import IUserPreferenceRepo
from app.infrastructure.db.models.user_preference import UserPreferenceORM


class SqlUserPreferenceRepo(IUserPreferenceRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_for_user(self, user_id: str) -> dict[str, Any]:
        stmt = select(UserPreferenceORM.key, UserPreferenceORM.value).where(
            UserPreferenceORM.user_id == user_id
        )
        rows = (await self._s.execute(stmt)).all()
        return {key: value for key, value in rows}

    async def upsert_many(
        self,
        *,
        user_id: str,
        entries: dict[str, Any],
        id_factory: Callable[[], str],
    ) -> None:
        if not entries:
            return
        values = [
            {
                "id": id_factory(),
                "user_id": user_id,
                "key": key,
                "value": value,
            }
            for key, value in entries.items()
        ]
        stmt = pg_insert(UserPreferenceORM).values(values)
        # ON CONFLICT (user_id, key) DO UPDATE — turns this into an
        # atomic upsert without a read-then-write round-trip.
        stmt = stmt.on_conflict_do_update(
            constraint="uq_user_preferences_user_id_key",
            set_={
                "value": stmt.excluded.value,
            },
        )
        await self._s.execute(stmt)
        await self._s.flush()
