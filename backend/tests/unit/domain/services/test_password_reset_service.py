from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import ValidationError
from app.core.security import hash_password, verify_password
from app.domain.services.password_reset_service import PasswordResetService
from tests.unit.fakes import (
    FakeAuthProvider,
    FakeClock,
    FakeIdGen,
    FakeNotifier,
    FakeResetTokenRepo,
    FakeUserRepo,
)


def _build_service(*, ttl_hours: int = 1):
    clock = FakeClock(current=datetime(2026, 5, 14, 12, 0, tzinfo=UTC))
    ids = FakeIdGen()
    users = FakeUserRepo()
    tokens = FakeResetTokenRepo()
    notifier = FakeNotifier()
    auth = FakeAuthProvider()
    service = PasswordResetService(
        users=users,
        tokens=tokens,
        notifier=notifier,
        auth=auth,
        clock=clock,
        ids=ids,
        token_ttl=timedelta(hours=ttl_hours),
        reset_url_base="https://app.test/reset",
    )
    return service, users, tokens, notifier, auth, clock


async def _seed_user(
    users: FakeUserRepo,
    *,
    email: str = "alice@example.com",
    password: str = "Hunter2-original",
):
    return await users.create(
        user_id="u-1",
        email=email,
        password_hash=hash_password(password),
        display_name="Alice",
    )


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def test_request_reset_creates_token_and_sends_email():
    service, users, tokens, notifier, _auth, _ = _build_service()
    await _seed_user(users)

    await service.request_reset(email="alice@example.com", requested_ip="1.2.3.4")

    assert len(tokens.records) == 1
    record = next(iter(tokens.records.values()))
    assert record.user_id == "u-1"
    assert record.consumed_at is None

    assert len(notifier.emails) == 1
    sent = notifier.emails[0]
    assert sent["to"] == "alice@example.com"
    assert "重設" in sent["subject"]
    assert "https://app.test/reset?token=" in sent["body"]


async def test_request_reset_silent_on_unknown_email():
    service, users, tokens, notifier, _auth, _ = _build_service()
    await _seed_user(users)

    await service.request_reset(email="nobody@example.com", requested_ip=None)

    assert tokens.records == {}
    assert notifier.emails == []


async def test_request_reset_invalidates_previous_active_tokens():
    service, users, tokens, notifier, _auth, _ = _build_service()
    await _seed_user(users)

    await service.request_reset(email="alice@example.com", requested_ip=None)
    await service.request_reset(email="alice@example.com", requested_ip=None)

    active = [r for r in tokens.records.values() if r.consumed_at is None]
    assert len(active) == 1
    consumed = [r for r in tokens.records.values() if r.consumed_at is not None]
    assert len(consumed) == 1


async def test_reset_password_succeeds_with_valid_token():
    service, users, tokens, notifier, _auth, _ = _build_service()
    await _seed_user(users, password="Hunter2-original")

    await service.request_reset(email="alice@example.com", requested_ip=None)
    raw_token = notifier.emails[0]["body"].split("token=", 1)[1].split()[0]

    await service.reset_password(raw_token=raw_token, new_password="NewSecret123")

    assert verify_password("NewSecret123", users.hashes["u-1"])
    assert not verify_password("Hunter2-original", users.hashes["u-1"])
    record = tokens.records[next(iter(tokens.records))]
    assert record.consumed_at is not None


async def test_reset_password_rejects_invalid_token():
    service, users, _, _, _auth, _ = _build_service()
    await _seed_user(users)

    with pytest.raises(ValidationError):
        await service.reset_password(
            raw_token="not-a-real-token", new_password="NewSecret123"
        )


async def test_reset_password_rejects_expired_token():
    service, users, tokens, notifier, _auth, clock = _build_service(ttl_hours=1)
    await _seed_user(users)
    await service.request_reset(email="alice@example.com", requested_ip=None)
    raw_token = notifier.emails[0]["body"].split("token=", 1)[1].split()[0]

    clock.advance(timedelta(hours=2))

    with pytest.raises(ValidationError):
        await service.reset_password(raw_token=raw_token, new_password="NewSecret123")


async def test_reset_password_rejects_already_consumed_token():
    service, users, tokens, notifier, _auth, _ = _build_service()
    await _seed_user(users)
    await service.request_reset(email="alice@example.com", requested_ip=None)
    raw_token = notifier.emails[0]["body"].split("token=", 1)[1].split()[0]

    await service.reset_password(raw_token=raw_token, new_password="NewSecret123")

    with pytest.raises(ValidationError):
        await service.reset_password(raw_token=raw_token, new_password="OtherSecret456")


async def test_reset_password_validates_strength():
    service, users, tokens, notifier, _auth, _ = _build_service()
    await _seed_user(users)
    await service.request_reset(email="alice@example.com", requested_ip=None)
    raw_token = notifier.emails[0]["body"].split("token=", 1)[1].split()[0]

    with pytest.raises(ValidationError):
        await service.reset_password(raw_token=raw_token, new_password="onlyletters")

    with pytest.raises(ValidationError):
        await service.reset_password(raw_token=raw_token, new_password="12345678")


async def test_token_hash_stored_not_raw():
    service, users, tokens, notifier, _auth, _ = _build_service()
    await _seed_user(users)
    await service.request_reset(email="alice@example.com", requested_ip=None)

    raw_token = notifier.emails[0]["body"].split("token=", 1)[1].split()[0]
    record = next(iter(tokens.records.values()))

    assert record.token_hash != raw_token
    assert record.token_hash == _hash_token(raw_token)
