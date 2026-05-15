from __future__ import annotations

import itertools
from datetime import UTC, datetime

import pytest

from app.core.clock import SystemClock
from app.core.exceptions import (
    ConflictError,
    IdempotencyViolationError,
    InsufficientFundsError,
    NotFoundError,
)
from app.core.ids import IIdGenerator
from app.domain.repositories.shop_item_price_repo import (
    IShopItemPriceRepo,
    ShopItemPrice,
)
from app.domain.repositories.shop_repo import IShopRepo, ShopItemRecord
from app.domain.repositories.user_item_repo import IUserItemRepo, UserItem
from app.domain.services.purchase_service import PurchaseService
from app.domain.services.wallet_service import WalletService

# Reuse the WalletService fakes from the wallet test module.
from tests.unit.domain.services.test_wallet_service import (
    FakeWalletRepo,
    FakeWalletTransactionRepo,
    RecordingPublisher,
)


class CounterIds(IIdGenerator):
    def __init__(self):
        self._n = itertools.count(1)

    def new(self):
        return f"id-{next(self._n)}"

    def new_id(self):
        return self.new()


class FakeShopRepo(IShopRepo):
    def __init__(self, items: list[ShopItemRecord]):
        self._by_id = {i.id: i for i in items}

    async def list_all(self):
        return list(self._by_id.values())

    async def list_by_category(self, category):
        return [i for i in self._by_id.values() if i.category == category]

    async def get_by_id(self, item_id):
        return self._by_id.get(item_id)


class FakeShopItemPriceRepo(IShopItemPriceRepo):
    def __init__(self, prices: list[ShopItemPrice]):
        self._prices = prices

    async def list_for_item(self, shop_item_id):
        return [p for p in self._prices if p.shop_item_id == shop_item_id]

    async def list_for_items(self, shop_item_ids):
        out: dict[str, list[ShopItemPrice]] = {}
        for p in self._prices:
            out.setdefault(p.shop_item_id, []).append(p)
        return {k: v for k, v in out.items() if k in shop_item_ids}

    async def get(self, *, shop_item_id, currency_code):
        for p in self._prices:
            if p.shop_item_id == shop_item_id and p.currency_code == currency_code:
                return p
        return None


class FakeUserItemRepo(IUserItemRepo):
    def __init__(self):
        self._rows: list[UserItem] = []

    async def insert(self, *, item_id, user_id, shop_item_id, acquired_via,
                     wallet_transaction_id):
        for r in self._rows:
            if r.user_id == user_id and r.shop_item_id == shop_item_id:
                raise IdempotencyViolationError("user_item_already_owned")
        ui = UserItem(
            id=item_id, user_id=user_id, shop_item_id=shop_item_id,
            acquired_via=acquired_via,
            wallet_transaction_id=wallet_transaction_id,
            acquired_at=datetime.now(UTC),
        )
        self._rows.append(ui)
        return ui

    async def list_for_user(self, user_id):
        return [r for r in self._rows if r.user_id == user_id]

    async def owns(self, *, user_id, shop_item_id):
        return any(
            r.user_id == user_id and r.shop_item_id == shop_item_id
            for r in self._rows
        )


def _item(item_id="i1", category="car") -> ShopItemRecord:
    return ShopItemRecord(
        id=item_id, category=category, icon="🚗", name="霓虹跑車",
        description="...", price_cents=4900, featured=False,
    )


def _price(item_id="i1", code="T", amount=50) -> ShopItemPrice:
    return ShopItemPrice(
        id=f"p-{item_id}-{code}", shop_item_id=item_id,
        currency_code=code, amount_minor=amount, active=True,
    )


def _make_service(
    items=None, prices=None, initial_balance=0,
) -> tuple[PurchaseService, FakeWalletRepo, FakeUserItemRepo]:
    items = items or [_item()]
    prices = prices or [_price()]
    wallets = FakeWalletRepo()
    txns = FakeWalletTransactionRepo()
    ids = CounterIds()
    wallet_svc = WalletService(
        wallets=wallets, transactions=txns,
        publisher=RecordingPublisher(),
        ids=ids, clock=SystemClock(),
    )
    user_items = FakeUserItemRepo()
    svc = PurchaseService(
        shop=FakeShopRepo(items),
        prices=FakeShopItemPriceRepo(prices),
        user_items=user_items,
        wallet_service=wallet_svc,
        ids=ids,
    )
    # seed wallet
    if initial_balance:
        import asyncio
        asyncio.get_event_loop().run_until_complete(
            wallet_svc.credit(
                user_id="u1", currency_code="T",
                amount_minor=initial_balance, reason="admin_grant",
            )
        )
    return svc, wallets, user_items


@pytest.mark.asyncio
async def test_purchase_success_debits_and_owns():
    svc, wallets, user_items = _make_service()
    # seed wallet using the service so we don't depend on private internals
    # (mimics "earned coins from sessions").
    await wallets.get_or_create(user_id="u1", currency_code="T", wallet_id="w1")
    await wallets.adjust(wallet_id="w1", delta_minor=100)

    result = await svc.purchase(user_id="u1", shop_item_id="i1", currency_code="T")

    assert result.new_balance_minor == 50
    assert result.transaction.delta_minor == -50
    assert await user_items.owns(user_id="u1", shop_item_id="i1")
    assert (await wallets.get("u1", "T")).balance_minor == 50


@pytest.mark.asyncio
async def test_purchase_item_not_found():
    svc, _, _ = _make_service()
    with pytest.raises(NotFoundError, match="item_not_found"):
        await svc.purchase(user_id="u1", shop_item_id="missing")


@pytest.mark.asyncio
async def test_purchase_currency_not_supported():
    svc, _, _ = _make_service(prices=[_price(code="TWD", amount=100)])
    with pytest.raises(NotFoundError, match="price_not_available_in_currency"):
        await svc.purchase(user_id="u1", shop_item_id="i1", currency_code="T")


@pytest.mark.asyncio
async def test_purchase_insufficient_funds():
    svc, wallets, _ = _make_service()
    # wallet has 30, price is 50
    await wallets.get_or_create(user_id="u1", currency_code="T", wallet_id="w1")
    await wallets.adjust(wallet_id="w1", delta_minor=30)

    with pytest.raises(InsufficientFundsError):
        await svc.purchase(user_id="u1", shop_item_id="i1")


@pytest.mark.asyncio
async def test_purchase_already_owned_raises_conflict():
    svc, wallets, _ = _make_service()
    # First purchase succeeds; second hits UNIQUE.
    await wallets.get_or_create(user_id="u1", currency_code="T", wallet_id="w1")
    await wallets.adjust(wallet_id="w1", delta_minor=200)

    await svc.purchase(user_id="u1", shop_item_id="i1")
    with pytest.raises(ConflictError, match="already_owned"):
        await svc.purchase(user_id="u1", shop_item_id="i1")
