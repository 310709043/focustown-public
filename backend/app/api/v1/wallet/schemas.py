from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class WalletResponse(BaseModel):
    currency_code: str
    balance_minor: int


class WalletTransactionResponse(BaseModel):
    id: str
    currency_code: str
    delta_minor: int
    reason: str
    ref_type: str | None
    ref_id: str | None
    balance_after_minor: int
    created_at: datetime
