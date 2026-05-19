from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


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
    metadata: dict[str, Any] | None = None


class RedeemCodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=40)


class RedeemCodeResponse(BaseModel):
    currency_code: str
    amount_minor: int
    balance_after_minor: int
    transaction_id: str


class GiftRequest(BaseModel):
    recipient_user_id: str = Field(min_length=1, max_length=36)
    amount_minor: int = Field(gt=0)
    message: str | None = Field(default=None, max_length=200)


class GiftResponse(BaseModel):
    transaction_id: str
    balance_after_minor: int
    amount_minor: int
    recipient_user_id: str
