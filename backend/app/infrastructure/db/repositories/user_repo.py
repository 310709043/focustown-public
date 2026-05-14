from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.domain.models import User
from app.domain.repositories.user_repo import IUserRepo, UserCredentials
from app.infrastructure.db.models.user import UserORM


def _to_domain(row: UserORM) -> User:
    return User(
        id=row.id,
        email=row.email,
        display_name=row.display_name,
        character_key=row.character_key,
        role_label=row.role_label,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
        terms_accepted_at=row.terms_accepted_at,
        terms_version=row.terms_version,
        marketing_opt_in=row.marketing_opt_in,
        marketing_opt_in_at=row.marketing_opt_in_at,
    )


class SqlUserRepo(IUserRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_by_id(self, user_id: str) -> User | None:
        row = await self._s.get(UserORM, user_id)
        return _to_domain(row) if row else None

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(UserORM).where(UserORM.email == email.lower())
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def get_credentials_by_email(self, email: str) -> UserCredentials | None:
        stmt = select(UserORM).where(UserORM.email == email.lower())
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None
        return UserCredentials(user=_to_domain(row), password_hash=row.password_hash)

    async def create(
        self,
        *,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
        terms_accepted_at: datetime | None = None,
        terms_version: str | None = None,
        marketing_opt_in: bool = False,
        marketing_opt_in_at: datetime | None = None,
    ) -> User:
        existing = await self.get_credentials_by_email(email)
        if existing is not None:
            raise ConflictError("email_already_registered")
        row = UserORM(
            id=user_id,
            email=email.lower(),
            password_hash=password_hash,
            display_name=display_name,
            is_active=True,
            terms_accepted_at=terms_accepted_at,
            terms_version=terms_version,
            marketing_opt_in=marketing_opt_in,
            marketing_opt_in_at=marketing_opt_in_at,
        )
        self._s.add(row)
        await self._s.flush()
        return _to_domain(row)

    async def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None = None,
        character_key: str | None = None,
        role_label: str | None = None,
    ) -> User:
        row = await self._s.get(UserORM, user_id)
        if row is None:
            raise NotFoundError("user_not_found")
        if display_name is not None:
            row.display_name = display_name
        if character_key is not None:
            row.character_key = character_key
        if role_label is not None:
            row.role_label = role_label
        await self._s.flush()
        return _to_domain(row)

    async def update_password_hash(self, *, user_id: str, password_hash: str) -> None:
        row = await self._s.get(UserORM, user_id)
        if row is None:
            raise NotFoundError("user_not_found")
        row.password_hash = password_hash
        await self._s.flush()

    async def list_recent(self, *, limit: int) -> list[User]:
        stmt = select(UserORM).order_by(UserORM.created_at.desc()).limit(limit)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def get_many_by_ids(self, user_ids: list[str]) -> list[User]:
        if not user_ids:
            return []
        stmt = select(UserORM).where(UserORM.id.in_(user_ids))
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]
