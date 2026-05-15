from __future__ import annotations

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import IdempotencyViolationError
from app.domain.repositories.user_item_repo import IUserItemRepo, UserItem
from app.infrastructure.db.models.user_item import UserItemORM

__all__ = ["SqlUserItemRepo"]


def _to_domain(row: UserItemORM) -> UserItem:
    return UserItem(
        id=row.id,
        user_id=row.user_id,
        shop_item_id=row.shop_item_id,
        acquired_via=row.acquired_via,
        wallet_transaction_id=row.wallet_transaction_id,
        acquired_at=row.created_at,
    )


class SqlUserItemRepo(IUserItemRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def insert(
        self,
        *,
        item_id: str,
        user_id: str,
        shop_item_id: str,
        acquired_via: str,
        wallet_transaction_id: str | None,
    ) -> UserItem:
        row = UserItemORM(
            id=item_id,
            user_id=user_id,
            shop_item_id=shop_item_id,
            acquired_via=acquired_via,
            wallet_transaction_id=wallet_transaction_id,
        )
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as exc:
            # user_items has a single UNIQUE (user_id, shop_item_id); any
            # IntegrityError on this row is the "already owned" case.
            raise IdempotencyViolationError("user_item_already_owned") from exc
        return _to_domain(row)

    async def list_for_user(self, user_id: str) -> list[UserItem]:
        stmt = (
            select(UserItemORM)
            .where(UserItemORM.user_id == user_id)
            .order_by(UserItemORM.created_at.desc())
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def owns(self, *, user_id: str, shop_item_id: str) -> bool:
        stmt = select(
            exists().where(
                UserItemORM.user_id == user_id,
                UserItemORM.shop_item_id == shop_item_id,
            )
        )
        return bool((await self._s.execute(stmt)).scalar())

    async def get_by_id_and_owner(
        self, *, user_item_id: str, owner_user_id: str
    ) -> UserItem | None:
        stmt = select(UserItemORM).where(
            UserItemORM.id == user_item_id,
            UserItemORM.user_id == owner_user_id,
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None
