from __future__ import annotations

from app.core.clock import IClock
from app.core.exceptions import InsufficientFundsError
from app.core.ids import IIdGenerator
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.wallet_repo import IWalletRepo
from app.domain.repositories.wallet_transaction_repo import (
    IWalletTransactionRepo,
    WalletTransaction,
)


class WalletService:
    """Credit / debit a user's wallet with full audit trail.

    Atomicity is provided by the surrounding DB transaction (FastAPI's
    ``get_db`` commits-or-rolls-back per request; event handlers open a
    short-lived session of their own). The same applies to publish: it
    happens after flush() succeeds, before commit, so a downstream commit
    failure would mean we already broadcast — acceptable since the client
    just sees one delayed-but-correct value on the next snapshot fetch.

    Idempotency is enforced by the repository (which translates its
    storage-native uniqueness error into ``IdempotencyViolationError``).
    The service re-raises that domain exception so callers can decide
    whether to treat it as a no-op (event awards) or a conflict
    (purchase attempts).
    """

    def __init__(
        self,
        *,
        wallets: IWalletRepo,
        transactions: IWalletTransactionRepo,
        publisher: IRealtimePublisher | None,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._wallets = wallets
        self._txns = transactions
        self._pub = publisher
        self._ids = ids
        self._clock = clock

    async def credit(
        self,
        *,
        user_id: str,
        currency_code: str,
        amount_minor: int,
        reason: str,
        ref_type: str | None = None,
        ref_id: str | None = None,
    ) -> WalletTransaction:
        if amount_minor <= 0:
            raise ValueError("amount_minor must be positive")
        return await self._apply(
            user_id=user_id,
            currency_code=currency_code,
            delta_minor=amount_minor,
            reason=reason,
            ref_type=ref_type,
            ref_id=ref_id,
        )

    async def debit(
        self,
        *,
        user_id: str,
        currency_code: str,
        amount_minor: int,
        reason: str,
        ref_type: str | None = None,
        ref_id: str | None = None,
    ) -> WalletTransaction:
        if amount_minor <= 0:
            raise ValueError("amount_minor must be positive")
        return await self._apply(
            user_id=user_id,
            currency_code=currency_code,
            delta_minor=-amount_minor,
            reason=reason,
            ref_type=ref_type,
            ref_id=ref_id,
        )

    async def get_balance_minor(self, user_id: str, currency_code: str) -> int:
        wallet = await self._wallets.get(user_id, currency_code)
        return wallet.balance_minor if wallet else 0

    # ─── internals ─────────────────────────────────────────────────────────

    async def _apply(
        self,
        *,
        user_id: str,
        currency_code: str,
        delta_minor: int,
        reason: str,
        ref_type: str | None,
        ref_id: str | None,
    ) -> WalletTransaction:
        wallet = await self._wallets.get_or_create(
            user_id=user_id,
            currency_code=currency_code,
            wallet_id=self._ids.new_id(),
        )
        new_balance = await self._wallets.adjust(
            wallet_id=wallet.id, delta_minor=delta_minor
        )
        if new_balance is None:
            # adjust() returns None iff the resulting balance would go negative.
            raise InsufficientFundsError("insufficient_funds")
        txn = await self._txns.insert(
            txn_id=self._ids.new_id(),
            user_id=user_id,
            currency_code=currency_code,
            delta_minor=delta_minor,
            reason=reason,
            ref_type=ref_type,
            ref_id=ref_id,
            balance_after_minor=new_balance,
        )
        if self._pub is not None:
            await self._pub.publish(
                IRealtimePublisher.user_channel(user_id),
                {
                    "type": "wallet.updated",
                    "currency_code": currency_code,
                    "balance_minor": new_balance,
                    "delta_minor": delta_minor,
                    "reason": reason,
                },
            )
        return txn


