from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.core.events import EventBus
from app.core.exceptions import IdempotencyViolationError
from app.core.logging import get_logger
from app.domain.events import SessionCompleted
from app.domain.services.wallet_service import WalletService

log = get_logger(__name__)


# 100 cT (= 1 T) per 30 minutes of focused work. Phase 2 deals exclusively in
# T; future earning sources (login bonus, quests) will introduce additional
# reasons but reuse the same WalletService.credit pipeline.
EARN_RATE_MINOR_PER_30MIN = 100
EARN_DENOMINATOR_SECONDS = 1800


def compute_award_minor(duration_seconds: int) -> int:
    """duration_seconds * 100 // 1800 -> 0.5 T for 15 min, 1 T for 30 min."""
    if duration_seconds <= 0:
        return 0
    return duration_seconds * EARN_RATE_MINOR_PER_30MIN // EARN_DENOMINATOR_SECONDS


# A factory the lifespan-registered subscriber uses to spin up a per-event
# WalletService bound to its own short-lived DB session.
WalletServiceFactory = Callable[[], "_WalletServiceAcquired"]


class _WalletServiceAcquired:
    """Bag of (wallet_service, commit, rollback, close) the subscriber calls.

    Exists so the registered handler doesn't need to know which adapters
    back the wallet (it stays a domain-level dependency).
    """

    def __init__(
        self,
        *,
        wallet_service: WalletService,
        commit: Callable[[], Awaitable[None]],
        rollback: Callable[[], Awaitable[None]],
        close: Callable[[], Awaitable[None]],
    ) -> None:
        self.wallet_service = wallet_service
        self.commit = commit
        self.rollback = rollback
        self.close = close


class CoinAwardService:
    """Credits T coins on SessionCompleted.

    Registered ONCE at app startup (see ``main.py`` lifespan). Each event
    opens its own DB session via the injected factory so we don't hold the
    request's session beyond the request's lifetime.
    """

    def __init__(self, factory: WalletServiceFactory) -> None:
        self._factory = factory

    def register(self, bus: EventBus) -> None:
        bus.subscribe(SessionCompleted, self._on_session_completed)

    async def _on_session_completed(self, event: SessionCompleted) -> None:
        award = compute_award_minor(event.duration_seconds)
        if award == 0:
            return

        acquired = self._factory()
        try:
            try:
                await acquired.wallet_service.credit(
                    user_id=event.user_id,
                    currency_code="T",
                    amount_minor=award,
                    reason="session_complete",
                    ref_type="focus_session",
                    ref_id=event.session_id,
                )
                await acquired.commit()
            except IdempotencyViolationError:
                # Same session already awarded (e.g. retry); silently skip.
                await acquired.rollback()
        finally:
            await acquired.close()
