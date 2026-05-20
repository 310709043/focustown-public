from __future__ import annotations

from app.core.exceptions import BusinessError, NotFoundError, ValidationError
from app.core.ids import IIdGenerator
from app.domain.repositories.user_repo import IUserRepo
from app.domain.repositories.wallet_transaction_repo import WalletTransaction
from app.domain.services.wallet_service import WalletService

GIFT_MIN_MINOR = 100  # 1 T
GIFT_MAX_MINOR = 100_000  # 1000 T per gift, hard cap
GIFT_MESSAGE_MAX_LEN = 200


class GiftSelfError(BusinessError):
    """User attempted to gift themselves."""


class GiftService:
    """Peer-to-peer T-coin gifting.

    SOLID notes:
      • SRP — only models the sender→recipient atomic transfer; UI
        affordances (recipient lookup by name, etc.) belong elsewhere.
      • DIP — leans on `IUserRepo` (Protocol) for recipient validation
        and on `WalletService` (already SOLID) for the actual ledger
        writes; never imports SQLAlchemy.
      • OCP — adding wrap-around feature flags (rate limit, daily cap)
        is additive in the service; the two ledger writes stay shaped.

    Atomicity: both writes happen inside the surrounding DB session
    (FastAPI commits per request). A failed second leg rolls back the
    first because they share the same transaction. The paired
    ``ref_id`` UUID makes both halves discoverable in the ledger.
    """

    def __init__(
        self,
        *,
        wallets: WalletService,
        users: IUserRepo,
        ids: IIdGenerator,
        currency_code: str = "T",
    ) -> None:
        self._wallets = wallets
        self._users = users
        self._ids = ids
        self._currency = currency_code

    async def gift(
        self,
        *,
        sender_id: str,
        recipient_id: str,
        amount_minor: int,
        message: str | None = None,
        idempotency_key: str | None = None,
    ) -> tuple[WalletTransaction, WalletTransaction]:
        if not amount_minor or amount_minor < GIFT_MIN_MINOR:
            raise ValidationError("gift_amount_too_small")
        if amount_minor > GIFT_MAX_MINOR:
            raise ValidationError("gift_amount_too_large")
        if sender_id == recipient_id:
            raise GiftSelfError("gift_self_forbidden")

        recipient = await self._users.get_by_id(recipient_id)
        if recipient is None:
            raise NotFoundError("recipient_not_found")

        cleaned_message: str | None = None
        if message:
            cleaned_message = message.strip()[:GIFT_MESSAGE_MAX_LEN] or None

        # Per migration 0021, the partial unique index
        # ``ux_wallet_txn_idempotent`` now covers ``gift_sent``/
        # ``gift_received``. Using a single ``pair_id`` as ``ref_id`` for
        # BOTH ledger halves means a double-click that re-sends the same
        # Idempotency-Key produces an `IdempotencyViolationError` on the
        # second attempt instead of a duplicate transfer. When the caller
        # omits the key (legacy / unaware clients), we still mint a
        # server-side UUID so the constraint never trips on legitimate
        # repeat gifts — at the cost of NOT deduping double-clicks for
        # those callers. Frontends should pass a stable Idempotency-Key
        # per "Send" button click.
        pair_id = idempotency_key or self._ids.new_id()
        debit = await self._wallets.debit(
            user_id=sender_id,
            currency_code=self._currency,
            amount_minor=amount_minor,
            reason="gift_sent",
            ref_type="gift_pair",
            ref_id=pair_id,
            metadata={
                "pair_id": pair_id,
                "recipient_id": recipient_id,
                "message": cleaned_message,
            },
        )
        credit = await self._wallets.credit(
            user_id=recipient_id,
            currency_code=self._currency,
            amount_minor=amount_minor,
            reason="gift_received",
            ref_type="gift_pair",
            ref_id=pair_id,
            metadata={
                "pair_id": pair_id,
                "sender_id": sender_id,
                "message": cleaned_message,
            },
        )
        return debit, credit
