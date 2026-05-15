from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import IdempotencyViolationError
from app.domain.repositories.wallet_transaction_repo import (
    IWalletTransactionRepo,
    WalletTransaction,
)
from app.infrastructure.db.models.wallet_transaction import WalletTransactionORM

# Name of the partial unique index defined in the wallet_transactions
# migration. Knowing it lets us distinguish the idempotency case from any
# other IntegrityError (FK, NOT NULL, ...) which must propagate as-is.
_IDEMPOTENCY_CONSTRAINT = "ux_wallet_txn_idempotent"


def _is_idempotency_violation(exc: IntegrityError) -> bool:
    msg = str(exc.orig) if exc.orig is not None else str(exc)
    return _IDEMPOTENCY_CONSTRAINT in msg


def _to_domain(row: WalletTransactionORM) -> WalletTransaction:
    return WalletTransaction(
        id=row.id,
        user_id=row.user_id,
        currency_code=row.currency_code,
        delta_minor=row.delta_minor,
        reason=row.reason,
        ref_type=row.ref_type,
        ref_id=row.ref_id,
        balance_after_minor=row.balance_after_minor,
        created_at=row.created_at,
    )


class SqlWalletTransactionRepo(IWalletTransactionRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def insert(
        self,
        *,
        txn_id: str,
        user_id: str,
        currency_code: str,
        delta_minor: int,
        reason: str,
        ref_type: str | None,
        ref_id: str | None,
        balance_after_minor: int,
    ) -> WalletTransaction:
        row = WalletTransactionORM(
            id=txn_id,
            user_id=user_id,
            currency_code=currency_code,
            delta_minor=delta_minor,
            reason=reason,
            ref_type=ref_type,
            ref_id=ref_id,
            balance_after_minor=balance_after_minor,
        )
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as exc:
            if _is_idempotency_violation(exc):
                raise IdempotencyViolationError("wallet_ledger_idempotent") from exc
            raise
        return _to_domain(row)

    async def list_for_user(
        self, user_id: str, *, limit: int
    ) -> list[WalletTransaction]:
        stmt = (
            select(WalletTransactionORM)
            .where(WalletTransactionORM.user_id == user_id)
            .order_by(WalletTransactionORM.created_at.desc())
            .limit(limit)
        )
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]
