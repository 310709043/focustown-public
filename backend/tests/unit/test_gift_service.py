"""Unit tests for ``GiftService``.

Covers: happy path debits sender and credits recipient; self-gift
rejected; amount bounds; non-existent recipient.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime

import pytest

from app.core.clock import IClock
from app.core.exceptions import (
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
)
from app.core.ids import IIdGenerator
from app.domain.models import User
from app.domain.services.gift_service import GiftSelfError, GiftService
from app.domain.services.wallet_service import WalletService
from tests.unit.domain.services.test_wallet_service import (
    FakeWalletRepo,
    FakeWalletTransactionRepo,
)
from tests.unit.fakes import FakeUserRepo


class CounterIds(IIdGenerator):
    def __init__(self) -> None:
        self._n = itertools.count(1)

    def new_id(self) -> str:
        return f"id-{next(self._n)}"


class FrozenClock(IClock):
    def now(self) -> datetime:  # type: ignore[override]
        return datetime(2026, 5, 19, 12, 0, tzinfo=UTC)


def _make_user(uid: str, name: str = "n") -> User:
    return User(
        id=uid,
        email=f"{uid}@x.test",
        display_name=name,
        character_key=None,
        role_label=None,
        is_active=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _service(
    *,
    users: FakeUserRepo,
    seed_balance_minor: int = 0,
) -> tuple[GiftService, WalletService, FakeWalletRepo]:
    ids = CounterIds()
    clock = FrozenClock()
    wallet_repo = FakeWalletRepo()
    wallet = WalletService(
        wallets=wallet_repo,
        transactions=FakeWalletTransactionRepo(),
        publisher=None,
        ids=ids,
        clock=clock,
    )
    svc = GiftService(wallets=wallet, users=users, ids=ids)
    return svc, wallet, wallet_repo


async def _seed(wallet: WalletService, user_id: str, amount: int) -> None:
    await wallet.credit(
        user_id=user_id,
        currency_code="T",
        amount_minor=amount,
        reason="seed",
    )


@pytest.mark.asyncio
async def test_gift_happy_path_debits_sender_and_credits_recipient() -> None:
    users = FakeUserRepo.from_users([_make_user("sender"), _make_user("recipient")])
    svc, wallet, _ = _service(users=users)
    await _seed(wallet, "sender", 5000)

    debit, credit = await svc.gift(
        sender_id="sender",
        recipient_id="recipient",
        amount_minor=1000,
        message="thanks!",
        idempotency_key="click-uuid-1",
    )

    assert debit.delta_minor == -1000
    assert debit.reason == "gift_sent"
    # Post-PR (security Phase 1): ref_type/ref_id now carry the per-click
    # pair id so the partial unique on wallet_transactions can dedupe
    # double-clicks. Both halves share the same pair id; recipient/sender
    # ids moved into ``metadata`` for downstream reconciliation.
    assert debit.ref_type == "gift_pair"
    assert debit.ref_id == "click-uuid-1"
    assert credit.delta_minor == 1000
    assert credit.reason == "gift_received"
    assert credit.ref_type == "gift_pair"
    assert credit.ref_id == "click-uuid-1"
    assert debit.metadata is not None and credit.metadata is not None
    assert debit.metadata["pair_id"] == "click-uuid-1"
    assert credit.metadata["pair_id"] == "click-uuid-1"
    assert debit.metadata["recipient_id"] == "recipient"
    assert credit.metadata["sender_id"] == "sender"
    assert credit.metadata["message"] == "thanks!"
    # Sender's balance decreased; recipient's increased.
    assert await wallet.get_balance_minor("sender", "T") == 4000
    assert await wallet.get_balance_minor("recipient", "T") == 1000


@pytest.mark.asyncio
async def test_gift_self_is_rejected() -> None:
    users = FakeUserRepo.from_users([_make_user("u1")])
    svc, _, _ = _service(users=users)
    with pytest.raises(GiftSelfError):
        await svc.gift(sender_id="u1", recipient_id="u1", amount_minor=100)


@pytest.mark.asyncio
async def test_gift_amount_below_minimum_rejected() -> None:
    users = FakeUserRepo.from_users([_make_user("a"), _make_user("b")])
    svc, _, _ = _service(users=users)
    with pytest.raises(ValidationError):
        await svc.gift(sender_id="a", recipient_id="b", amount_minor=50)


@pytest.mark.asyncio
async def test_gift_amount_above_maximum_rejected() -> None:
    users = FakeUserRepo.from_users([_make_user("a"), _make_user("b")])
    svc, _, _ = _service(users=users)
    with pytest.raises(ValidationError):
        await svc.gift(
            sender_id="a", recipient_id="b", amount_minor=10_000_000
        )


@pytest.mark.asyncio
async def test_gift_recipient_must_exist() -> None:
    users = FakeUserRepo.from_users([_make_user("sender")])
    svc, wallet, _ = _service(users=users)
    await _seed(wallet, "sender", 5000)
    with pytest.raises(NotFoundError):
        await svc.gift(
            sender_id="sender", recipient_id="ghost", amount_minor=1000
        )


@pytest.mark.asyncio
async def test_gift_when_sender_has_insufficient_funds() -> None:
    users = FakeUserRepo.from_users(
        [_make_user("poor"), _make_user("recipient")]
    )
    svc, _, _ = _service(users=users)
    with pytest.raises(InsufficientFundsError):
        await svc.gift(
            sender_id="poor", recipient_id="recipient", amount_minor=1000
        )
