from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.password_reset_token_repo import (
    IPasswordResetTokenRepo,
    ResetTokenRecord,
)
from app.infrastructure.db.models.password_reset_token import PasswordResetTokenORM


def _to_record(row: PasswordResetTokenORM) -> ResetTokenRecord:
    return ResetTokenRecord(
        id=row.id,
        user_id=row.user_id,
        token_hash=row.token_hash,
        expires_at=row.expires_at,
        consumed_at=row.consumed_at,
        created_at=row.created_at,
    )


class SqlPasswordResetTokenRepo(IPasswordResetTokenRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(
        self,
        *,
        token_id: str,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
        requested_ip: str | None,
    ) -> None:
        row = PasswordResetTokenORM(
            id=token_id,
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            requested_ip=requested_ip,
        )
        self._s.add(row)
        await self._s.flush()

    async def find_active_by_hash(self, token_hash: str) -> ResetTokenRecord | None:
        stmt = select(PasswordResetTokenORM).where(
            PasswordResetTokenORM.token_hash == token_hash,
            PasswordResetTokenORM.consumed_at.is_(None),
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_record(row) if row else None

    async def mark_consumed(self, token_id: str, *, at: datetime) -> None:
        await self._s.execute(
            update(PasswordResetTokenORM)
            .where(PasswordResetTokenORM.id == token_id)
            .values(consumed_at=at)
        )
        await self._s.flush()

    async def invalidate_active_for_user(self, user_id: str, *, at: datetime) -> None:
        await self._s.execute(
            update(PasswordResetTokenORM)
            .where(
                PasswordResetTokenORM.user_id == user_id,
                PasswordResetTokenORM.consumed_at.is_(None),
            )
            .values(consumed_at=at)
        )
        await self._s.flush()
