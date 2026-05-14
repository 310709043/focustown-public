from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True, frozen=True)
class Wallet:
    id: str
    user_id: str
    currency_code: str
    balance_minor: int
    updated_at: datetime


class IWalletRepo(Protocol):
    async def get(self, user_id: str, currency_code: str) -> Wallet | None: ...

    async def get_or_create(
        self, *, user_id: str, currency_code: str, wallet_id: str
    ) -> Wallet: ...

    async def list_for_user(self, user_id: str) -> list[Wallet]: ...

    async def adjust(self, *, wallet_id: str, delta_minor: int) -> int | None:
        """Atomically apply ``delta_minor`` to the wallet.

        Returns the new balance. Returns ``None`` if the adjustment would
        drive the balance below zero (the wallet is left unchanged in that
        case so the caller can raise ``InsufficientFunds``).
        """
