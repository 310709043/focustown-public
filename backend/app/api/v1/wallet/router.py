from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.v1.wallet.schemas import (
    GiftRequest,
    GiftResponse,
    RedeemCodeRequest,
    RedeemCodeResponse,
    WalletResponse,
    WalletTransactionResponse,
)
from app.core.deps import (
    ClockDep,
    CurrentUserId,
    DbDep,
    IdGenDep,
    RealtimePublisherDep,
)
from app.domain.services.gift_service import GiftService
from app.domain.services.redemption_service import RedemptionService
from app.domain.services.wallet_service import WalletService
from app.infrastructure.db.repositories import (
    SqlRedemptionCodeRepo,
    SqlUserRepo,
    SqlWalletRepo,
    SqlWalletTransactionRepo,
)

router = APIRouter()


def _wallet_service(db, publisher, ids, clock) -> WalletService:  # type: ignore[no-untyped-def]
    return WalletService(
        wallets=SqlWalletRepo(db),
        transactions=SqlWalletTransactionRepo(db),
        publisher=publisher,
        ids=ids,
        clock=clock,
    )


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
            metadata=t.metadata,
        )
        for t in rows
    ]


@router.post("/redeem", response_model=RedeemCodeResponse)
async def redeem_code(
    payload: RedeemCodeRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> RedeemCodeResponse:
    wallets = _wallet_service(db, publisher, ids, clock)
    svc = RedemptionService(
        codes=SqlRedemptionCodeRepo(db),
        wallets=wallets,
        ids=ids,
        clock=clock,
    )
    rc, txn = await svc.redeem(user_id=user_id, code=payload.code)
    return RedeemCodeResponse(
        currency_code=rc.currency_code,
        amount_minor=rc.amount_minor,
        balance_after_minor=txn.balance_after_minor,
        transaction_id=txn.id,
    )


@router.post("/gift", response_model=GiftResponse)
async def gift(
    payload: GiftRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> GiftResponse:
    wallets = _wallet_service(db, publisher, ids, clock)
    svc = GiftService(
        wallets=wallets,
        users=SqlUserRepo(db),
        ids=ids,
    )
    debit, _credit = await svc.gift(
        sender_id=user_id,
        recipient_id=payload.recipient_user_id,
        amount_minor=payload.amount_minor,
        message=payload.message,
    )
    return GiftResponse(
        transaction_id=debit.id,
        balance_after_minor=debit.balance_after_minor,
        amount_minor=payload.amount_minor,
        recipient_user_id=payload.recipient_user_id,
    )
