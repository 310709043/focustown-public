from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True, frozen=True)
class WalletTransaction:
    id: str
    user_id: str
    currency_code: str
    delta_minor: int
    reason: str
    ref_type: str | None
    ref_id: str | None
    balance_after_minor: int
    created_at: datetime


class IWalletTransactionRepo(Protocol):
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
        """Insert a ledger row.

        Raises ``IdempotencyViolationError`` if the partial unique index
        (user_id, currency_code, reason, ref_type, ref_id) WHERE
        reason IN ('session_complete', 'purchase') trips. Adapter
        implementations are responsible for translating their
        storage-native uniqueness exception (e.g. SQL ``IntegrityError``)
        into the domain exception — callers must never have to look at
        constraint names.
        """

    async def list_for_user(
        self, user_id: str, *, limit: int
    ) -> list[WalletTransaction]: ...
