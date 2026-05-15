from __future__ import annotations

import itertools
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.clock import SystemClock
from app.core.exceptions import IdempotencyViolationError, InsufficientFundsError
from app.core.ids import IIdGenerator
from app.domain.repositories.wallet_repo import IWalletRepo, Wallet
from app.domain.repositories.wallet_transaction_repo import (
    IWalletTransactionRepo,
    WalletTransaction,
)
from app.domain.services.wallet_service import WalletService

# ── In-memory fakes ────────────────────────────────────────────────────────

class CounterIds(IIdGenerator):
    def __init__(self):
        self._n = itertools.count(1)

    def new(self) -> str:
        return f"id-{next(self._n)}"

    def new_id(self) -> str:
        return self.new()


class FakeWalletRepo(IWalletRepo):
    def __init__(self):
        self._by_id: dict[str, Wallet] = {}
        self._by_key: dict[tuple[str, str], str] = {}

    async def get(self, user_id, currency_code):
        wid = self._by_key.get((user_id, currency_code))
        return self._by_id.get(wid) if wid else None

    async def get_or_create(self, *, user_id, currency_code, wallet_id):
        existing = await self.get(user_id, currency_code)
        if existing:
            return existing
        w = Wallet(
            id=wallet_id, user_id=user_id, currency_code=currency_code,
            balance_minor=0, updated_at=datetime.now(UTC),
        )
        self._by_id[wallet_id] = w
        self._by_key[(user_id, currency_code)] = wallet_id
        return w

    async def list_for_user(self, user_id):
        return [w for w in self._by_id.values() if w.user_id == user_id]

    async def adjust(self, *, wallet_id, delta_minor):
        w = self._by_id[wallet_id]
        new = w.balance_minor + delta_minor
        if new < 0:
            return None
        self._by_id[wallet_id] = Wallet(
            id=w.id, user_id=w.user_id, currency_code=w.currency_code,
            balance_minor=new, updated_at=datetime.now(UTC),
        )
        return new


class FakeWalletTransactionRepo(IWalletTransactionRepo):
    def __init__(self):
        self.rows: list[WalletTransaction] = []
        # Track idempotency keys; raise IdempotencyViolationError on duplicate
        # insert the same way the SQL adapter does when its partial unique
        # index trips.
        self._seen: set[tuple[str, str, str, str | None, str | None]] = set()

    async def insert(self, *, txn_id, user_id, currency_code, delta_minor,
                     reason, ref_type, ref_id, balance_after_minor):
        key = (user_id, currency_code, reason, ref_type, ref_id)
        if reason in {"session_complete", "purchase"} and key in self._seen:
            raise IdempotencyViolationError("wallet_ledger_idempotent")
        self._seen.add(key)
        t = WalletTransaction(
            id=txn_id, user_id=user_id, currency_code=currency_code,
            delta_minor=delta_minor, reason=reason, ref_type=ref_type,
            ref_id=ref_id, balance_after_minor=balance_after_minor,
            created_at=datetime.now(UTC),
        )
        self.rows.append(t)
        return t

    async def list_for_user(self, user_id, *, limit):
        return [r for r in self.rows if r.user_id == user_id][:limit]


class RecordingPublisher:
    def __init__(self):
        self.published: list[tuple[str, dict[str, Any]]] = []

    async def publish(self, channel, payload):
        self.published.append((channel, payload))


def _make_service(
    publisher=None,
) -> tuple[
    WalletService, FakeWalletRepo, FakeWalletTransactionRepo, RecordingPublisher
]:
    wallets = FakeWalletRepo()
    txns = FakeWalletTransactionRepo()
    pub = publisher or RecordingPublisher()
    svc = WalletService(
        wallets=wallets,
        transactions=txns,
        publisher=pub,
        ids=CounterIds(),
        clock=SystemClock(),
    )
    return svc, wallets, txns, pub


# ── Tests ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_credit_creates_wallet_and_publishes():
    svc, wallets, _txns, pub = _make_service()

    txn = await svc.credit(
        user_id="u1", currency_code="T", amount_minor=100,
        reason="session_complete", ref_type="focus_session", ref_id="s1",
    )

    assert txn.delta_minor == 100
    assert txn.balance_after_minor == 100
    assert (await wallets.get("u1", "T")).balance_minor == 100
    assert pub.published[0][0] == "user:u1"
    assert pub.published[0][1]["balance_minor"] == 100


@pytest.mark.asyncio
async def test_credit_then_credit_accumulates():
    svc, wallets, _, _ = _make_service()

    await svc.credit(user_id="u1", currency_code="T", amount_minor=100,
                     reason="admin_grant")
    await svc.credit(user_id="u1", currency_code="T", amount_minor=50,
                     reason="admin_grant")

    assert (await wallets.get("u1", "T")).balance_minor == 150


@pytest.mark.asyncio
async def test_debit_when_sufficient_funds():
    svc, wallets, _, _ = _make_service()

    await svc.credit(user_id="u1", currency_code="T", amount_minor=100,
                     reason="admin_grant")
    txn = await svc.debit(user_id="u1", currency_code="T", amount_minor=40,
                          reason="purchase", ref_type="shop_item", ref_id="i1")

    assert txn.delta_minor == -40
    assert txn.balance_after_minor == 60
    assert (await wallets.get("u1", "T")).balance_minor == 60


@pytest.mark.asyncio
async def test_debit_when_insufficient_funds_raises():
    svc, _, _, _ = _make_service()

    await svc.credit(user_id="u1", currency_code="T", amount_minor=10,
                     reason="admin_grant")
    with pytest.raises(InsufficientFundsError):
        await svc.debit(user_id="u1", currency_code="T", amount_minor=50,
                        reason="purchase", ref_type="shop_item", ref_id="i1")


@pytest.mark.asyncio
async def test_idempotent_credit_same_ref_raises_idempotency_violation_second_time():
    svc, _, _, _ = _make_service()

    await svc.credit(user_id="u1", currency_code="T", amount_minor=100,
                     reason="session_complete", ref_type="focus_session", ref_id="s1")
    with pytest.raises(IdempotencyViolationError):
        await svc.credit(user_id="u1", currency_code="T", amount_minor=100,
                         reason="session_complete", ref_type="focus_session", ref_id="s1")


@pytest.mark.asyncio
async def test_credit_with_non_idempotent_reason_can_repeat():
    svc, wallets, _, _ = _make_service()

    await svc.credit(user_id="u1", currency_code="T", amount_minor=10,
                     reason="admin_grant", ref_type="grant", ref_id="r1")
    await svc.credit(user_id="u1", currency_code="T", amount_minor=10,
                     reason="admin_grant", ref_type="grant", ref_id="r1")

    assert (await wallets.get("u1", "T")).balance_minor == 20


@pytest.mark.asyncio
async def test_zero_or_negative_amount_rejected():
    svc, _, _, _ = _make_service()

    with pytest.raises(ValueError):
        await svc.credit(user_id="u1", currency_code="T", amount_minor=0,
                         reason="admin_grant")
    with pytest.raises(ValueError):
        await svc.debit(user_id="u1", currency_code="T", amount_minor=-5,
                        reason="purchase")


@pytest.mark.asyncio
async def test_get_balance_zero_when_no_wallet():
    svc, _, _, _ = _make_service()
    assert await svc.get_balance_minor("nobody", "T") == 0
