from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.repositories.wallet_repo import IWalletRepo, Wallet
from app.infrastructure.db.models.wallet import WalletORM


def _to_domain(row: WalletORM) -> Wallet:
    return Wallet(
        id=row.id,
        user_id=row.user_id,
        currency_code=row.currency_code,
        balance_minor=row.balance_minor,
        updated_at=row.updated_at,
    )


class SqlWalletRepo(IWalletRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get(self, user_id: str, currency_code: str) -> Wallet | None:
        stmt = select(WalletORM).where(
            WalletORM.user_id == user_id,
            WalletORM.currency_code == currency_code,
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def get_or_create(
        self, *, user_id: str, currency_code: str, wallet_id: str
    ) -> Wallet:
        existing = await self.get(user_id, currency_code)
        if existing is not None:
            return existing
        row = WalletORM(
            id=wallet_id,
            user_id=user_id,
            currency_code=currency_code,
            balance_minor=0,
        )
        self._s.add(row)
        await self._s.flush()
        return _to_domain(row)

    async def list_for_user(self, user_id: str) -> list[Wallet]:
        stmt = select(WalletORM).where(WalletORM.user_id == user_id)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def adjust(self, *, wallet_id: str, delta_minor: int) -> int | None:
        # Atomic: only succeeds when resulting balance >= 0. Postgres returns
        # the new balance via RETURNING; if no row matches, the adjustment
        # would underflow and we report InsufficientFunds upstream.
        stmt = (
            update(WalletORM)
            .where(
                WalletORM.id == wallet_id,
                WalletORM.balance_minor + delta_minor >= 0,
            )
            .values(balance_minor=WalletORM.balance_minor + delta_minor)
            .returning(WalletORM.balance_minor)
        )
        result = await self._s.execute(stmt)
        new_balance = result.scalar_one_or_none()
        return new_balance
