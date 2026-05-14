from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.v1.wallet.schemas import WalletResponse, WalletTransactionResponse
from app.core.deps import CurrentUserId, DbDep
from app.infrastructure.db.repositories import (
    SqlWalletRepo,
    SqlWalletTransactionRepo,
)

router = APIRouter()


@router.get("", response_model=list[WalletResponse])
async def list_my_wallets(
    user_id: CurrentUserId,
    db: DbDep,
) -> list[WalletResponse]:
    repo = SqlWalletRepo(db)
    wallets = await repo.list_for_user(user_id)
    return [
        WalletResponse(
            currency_code=w.currency_code,
            balance_minor=w.balance_minor,
        )
        for w in wallets
    ]


@router.get("/transactions", response_model=list[WalletTransactionResponse])
async def list_my_transactions(
    user_id: CurrentUserId,
    db: DbDep,
    limit: int = Query(20, ge=1, le=100),
) -> list[WalletTransactionResponse]:
    repo = SqlWalletTransactionRepo(db)
    rows = await repo.list_for_user(user_id, limit=limit)
    return [
        WalletTransactionResponse(
            id=t.id,
            currency_code=t.currency_code,
            delta_minor=t.delta_minor,
            reason=t.reason,
            ref_type=t.ref_type,
            ref_id=t.ref_id,
            balance_after_minor=t.balance_after_minor,
            created_at=t.created_at,
        )
        for t in rows
    ]
