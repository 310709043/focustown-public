from __future__ import annotations

from datetime import UTC, datetime

from app.core.clock import IClock
from app.core.exceptions import (
    BusinessError,
    IdempotencyViolationError,
    NotFoundError,
)
from app.core.ids import IIdGenerator
from app.domain.repositories.redemption_code_repo import (
    IRedemptionCodeRepo,
    RedemptionCode,
)
from app.domain.repositories.wallet_transaction_repo import WalletTransaction
from app.domain.services.wallet_service import WalletService


class RedemptionAlreadyUsedError(BusinessError):
    """The current user already redeemed this code."""


class RedemptionExhaustedError(BusinessError):
    """Code is past its max_uses or window."""


class RedemptionService:
    """Atomic redeem flow.

    SOLID notes:
      • SRP — orchestrates lookup + use-recording + wallet credit; no
        validation logic for unrelated concerns.
      • DIP — depends on `IRedemptionCodeRepo` and the existing
        `WalletService`, never on SQLAlchemy.
      • Each step (lookup, record_use, increment, credit) is delegated
        to a Protocol so the service is unit-testable with fakes.

    Concurrency: ``get_by_code_for_update`` takes a row lock so the
    "is there capacity?" check and the subsequent counter bump are
    serialized for the same code. The ``UNIQUE(code_id, user_id)`` join
    constraint backstops the "one redeem per user" invariant even if
    the row lock is missed (e.g. fake repo in tests).
    """

    def __init__(
        self,
        *,
        codes: IRedemptionCodeRepo,
        wallets: WalletService,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._codes = codes
        self._wallets = wallets
        self._ids = ids
        self._clock = clock

    async def redeem(
        self, *, user_id: str, code: str
    ) -> tuple[RedemptionCode, WalletTransaction]:
        code = (code or "").strip()
        if not code:
            raise NotFoundError("redemption_code_not_found")

        rc = await self._codes.get_by_code_for_update(code)
        if rc is None:
            raise NotFoundError("redemption_code_not_found")

        self._assert_usable(rc)

        try:
            await self._codes.record_use(
                use_id=self._ids.new_id(),
                code_id=rc.id,
                user_id=user_id,
            )
        except IdempotencyViolationError as exc:
            raise RedemptionAlreadyUsedError("redemption_already_used") from exc

        await self._codes.increment_uses(rc.id)
        txn = await self._wallets.credit(
            user_id=user_id,
            currency_code=rc.currency_code,
            amount_minor=rc.amount_minor,
            reason="redeem_code",
            ref_type="redemption_code",
            ref_id=rc.id,
            metadata={"code": rc.code},
        )
        return rc, txn

    def _assert_usable(self, rc: RedemptionCode) -> None:
        now = self._clock.now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)
        if not rc.is_active:
            raise RedemptionExhaustedError("redemption_inactive")
        if rc.valid_from and _ensure_aware(rc.valid_from) > now:
            raise RedemptionExhaustedError("redemption_not_yet_valid")
        if rc.valid_until and _ensure_aware(rc.valid_until) < now:
            raise RedemptionExhaustedError("redemption_expired")
        if rc.max_uses is not None and rc.uses_count >= rc.max_uses:
            raise RedemptionExhaustedError("redemption_exhausted")


def _ensure_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
