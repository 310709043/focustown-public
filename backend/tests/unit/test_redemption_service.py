"""Unit tests for ``RedemptionService``.

Covers: happy path credits wallet, single-use idempotency, max-uses
exhaustion, expiry window, inactive code, blank/unknown code.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.core.clock import IClock
from app.core.exceptions import (
    IdempotencyViolationError,
    NotFoundError,
)
from app.core.ids import IIdGenerator
from app.domain.repositories.redemption_code_repo import (
    IRedemptionCodeRepo,
    RedemptionCode,
)
from app.domain.services.redemption_service import (
    RedemptionAlreadyUsedError,
    RedemptionExhaustedError,
    RedemptionService,
)
from app.domain.services.wallet_service import WalletService
from tests.unit.domain.services.test_wallet_service import (
    FakeWalletRepo,
    FakeWalletTransactionRepo,
)


class CounterIds(IIdGenerator):
    def __init__(self) -> None:
        self._n = itertools.count(1)

    def new_id(self) -> str:
        return f"id-{next(self._n)}"


class FrozenClock(IClock):
    def __init__(self, now: datetime) -> None:
        self._now = now

    def now(self) -> datetime:  # type: ignore[override]
        return self._now


class FakeRedemptionCodeRepo(IRedemptionCodeRepo):
    def __init__(self) -> None:
        self.codes: dict[str, RedemptionCode] = {}
        self.uses: set[tuple[str, str]] = set()  # (code_id, user_id)

    def add(self, rc: RedemptionCode) -> None:
        self.codes[rc.id] = rc

    async def get_by_code(self, code: str) -> RedemptionCode | None:
        for rc in self.codes.values():
            if rc.code == code:
                return rc
        return None

    async def get_by_code_for_update(self, code: str) -> RedemptionCode | None:
        return await self.get_by_code(code)

    async def record_use(
        self, *, use_id: str, code_id: str, user_id: str
    ) -> None:
        key = (code_id, user_id)
        if key in self.uses:
            raise IdempotencyViolationError("redemption_already_used")
        self.uses.add(key)

    async def increment_uses(self, code_id: str) -> int:
        rc = self.codes[code_id]
        new = rc.uses_count + 1
        self.codes[code_id] = _replace(rc, uses_count=new)
        return new


def _replace(rc: RedemptionCode, **kwargs: Any) -> RedemptionCode:
    return RedemptionCode(
        id=kwargs.get("id", rc.id),
        code=kwargs.get("code", rc.code),
        currency_code=kwargs.get("currency_code", rc.currency_code),
        amount_minor=kwargs.get("amount_minor", rc.amount_minor),
        max_uses=kwargs.get("max_uses", rc.max_uses),
        uses_count=kwargs.get("uses_count", rc.uses_count),
        valid_from=kwargs.get("valid_from", rc.valid_from),
        valid_until=kwargs.get("valid_until", rc.valid_until),
        is_active=kwargs.get("is_active", rc.is_active),
        metadata=kwargs.get("metadata", rc.metadata),
    )


def _make_service(
    code: RedemptionCode,
    *,
    now: datetime | None = None,
) -> tuple[RedemptionService, FakeRedemptionCodeRepo, WalletService]:
    codes = FakeRedemptionCodeRepo()
    codes.add(code)
    ids = CounterIds()
    clock = FrozenClock(now or datetime(2026, 5, 19, 12, 0, tzinfo=UTC))
    wallet = WalletService(
        wallets=FakeWalletRepo(),
        transactions=FakeWalletTransactionRepo(),
        publisher=None,
        ids=ids,
        clock=clock,
    )
    svc = RedemptionService(codes=codes, wallets=wallet, ids=ids, clock=clock)
    return svc, codes, wallet


def _make_code(**overrides: Any) -> RedemptionCode:
    base = RedemptionCode(
        id="code-1",
        code="WELCOME10",
        currency_code="T",
        amount_minor=1000,
        max_uses=None,
        uses_count=0,
        valid_from=datetime(2026, 1, 1, tzinfo=UTC),
        valid_until=None,
        is_active=True,
        metadata=None,
    )
    return _replace(base, **overrides)


@pytest.mark.asyncio
async def test_redeem_happy_path_credits_wallet_and_records_use() -> None:
    svc, codes, wallet = _make_service(_make_code())
    rc, txn = await svc.redeem(user_id="user-1", code="WELCOME10")
    assert txn.delta_minor == 1000
    assert txn.balance_after_minor == 1000
    assert txn.reason == "redeem_code"
    assert ("code-1", "user-1") in codes.uses
    assert codes.codes["code-1"].uses_count == 1


@pytest.mark.asyncio
async def test_redeem_same_user_twice_raises_already_used() -> None:
    svc, _, _ = _make_service(_make_code())
    await svc.redeem(user_id="user-1", code="WELCOME10")
    with pytest.raises(RedemptionAlreadyUsedError):
        await svc.redeem(user_id="user-1", code="WELCOME10")


@pytest.mark.asyncio
async def test_redeem_distinct_users_both_succeed_until_max_uses() -> None:
    svc, codes, _ = _make_service(_make_code(max_uses=2))
    await svc.redeem(user_id="user-1", code="WELCOME10")
    await svc.redeem(user_id="user-2", code="WELCOME10")
    with pytest.raises(RedemptionExhaustedError):
        # increment_uses() in the fake doesn't refresh the snapshot the
        # service holds; we need a fresh service to see post-bump count.
        svc2 = RedemptionService(
            codes=codes,
            wallets=svc._wallets,  # type: ignore[attr-defined]
            ids=CounterIds(),
            clock=FrozenClock(datetime(2026, 5, 19, 12, 0, tzinfo=UTC)),
        )
        await svc2.redeem(user_id="user-3", code="WELCOME10")


@pytest.mark.asyncio
async def test_redeem_inactive_code_raises_exhausted() -> None:
    svc, _, _ = _make_service(_make_code(is_active=False))
    with pytest.raises(RedemptionExhaustedError):
        await svc.redeem(user_id="user-1", code="WELCOME10")


@pytest.mark.asyncio
async def test_redeem_expired_code_raises_exhausted() -> None:
    expired = _make_code(
        valid_until=datetime(2026, 1, 1, tzinfo=UTC),
    )
    svc, _, _ = _make_service(
        expired,
        now=datetime(2026, 6, 1, tzinfo=UTC),
    )
    with pytest.raises(RedemptionExhaustedError):
        await svc.redeem(user_id="user-1", code="WELCOME10")


@pytest.mark.asyncio
async def test_redeem_not_yet_valid_raises_exhausted() -> None:
    future = _make_code(
        valid_from=datetime(2026, 12, 1, tzinfo=UTC),
    )
    svc, _, _ = _make_service(
        future,
        now=datetime(2026, 6, 1, tzinfo=UTC),
    )
    with pytest.raises(RedemptionExhaustedError):
        await svc.redeem(user_id="user-1", code="WELCOME10")


@pytest.mark.asyncio
async def test_redeem_unknown_code_raises_not_found() -> None:
    svc, _, _ = _make_service(_make_code())
    with pytest.raises(NotFoundError):
        await svc.redeem(user_id="user-1", code="NO_SUCH_CODE")


@pytest.mark.asyncio
async def test_redeem_blank_code_raises_not_found() -> None:
    svc, _, _ = _make_service(_make_code())
    with pytest.raises(NotFoundError):
        await svc.redeem(user_id="user-1", code="   ")
