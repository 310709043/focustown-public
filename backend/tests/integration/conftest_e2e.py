"""E2E-flow fixtures: register cross-feature event subscribers explicitly.

The production lifespan registers CoinAwardService against the global
EventBus with a session factory that opens its own DB session. In tests we
need that subscriber to see the same transactional view as the request — so
this fixture wires the same db_session into the subscriber and replaces
``commit``/``rollback``/``close`` with no-ops (the outer rollback in the
db_session fixture undoes everything anyway).
"""
from __future__ import annotations

import pytest_asyncio


@pytest_asyncio.fixture
async def coin_award_registered(app, db_session):
    """Yield an app that already has CoinAwardService subscribed.

    Depend on this fixture in any e2e test that needs the wallet to be
    credited as a side effect of session completion.
    """
    from app.core.clock import SystemClock
    from app.core.deps import _event_bus
    from app.core.ids import UUID4Generator
    from app.domain.services.coin_award_service import (
        CoinAwardService,
        _WalletServiceAcquired,
    )
    from app.domain.services.wallet_service import WalletService
    from app.infrastructure.db.repositories import (
        SqlWalletRepo,
        SqlWalletTransactionRepo,
    )

    async def _noop():
        return None

    def _factory() -> _WalletServiceAcquired:
        return _WalletServiceAcquired(
            wallet_service=WalletService(
                wallets=SqlWalletRepo(db_session),
                transactions=SqlWalletTransactionRepo(db_session),
                publisher=None,
                ids=UUID4Generator(),
                clock=SystemClock(),
            ),
            commit=_noop,
            rollback=_noop,
            close=_noop,
        )

    coin_award = CoinAwardService(factory=_factory)
    coin_award.register(_event_bus)

    yield app

    # Tear down: remove the subscriber so it does not leak into other tests.
    from app.domain.events import SessionCompleted

    handlers = _event_bus._handlers.get(SessionCompleted, [])
    if coin_award._on_session_completed in handlers:
        handlers.remove(coin_award._on_session_completed)
