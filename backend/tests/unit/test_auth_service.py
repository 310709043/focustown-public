from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.exceptions import AuthError, NotFoundError, ValidationError
from app.core.security import hash_password
from app.domain.models import User
from app.domain.services.auth_service import AuthService
from tests.unit.fakes import (
    FakeAuthProvider,
    FakeClock,
    FakeIdGen,
    FakeShopRepo,
    FakeUserRepo,
)

TERMS_VERSION_CURRENT = "2026-05-14"


def _make_service(
    *,
    users: FakeUserRepo | None = None,
    shop: FakeShopRepo | None = None,
) -> tuple[AuthService, FakeUserRepo, FakeAuthProvider, FakeShopRepo]:
    users = users or FakeUserRepo()
    shop = shop or FakeShopRepo()
    auth = FakeAuthProvider()
    svc = AuthService(
        users=users,
        auth_provider=auth,
        ids=FakeIdGen(),
        clock=FakeClock(current=datetime(2026, 5, 14, 12, 0, tzinfo=UTC)),
    )
    return svc, users, auth, shop


# ── sign_up ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sign_up_happy_creates_user_and_issues_tokens():
    svc, users, auth, _ = _make_service()

    outcome = await svc.sign_up(
        email="a@x.dev",
        password="goodpass123",
        display_name="Alice",
        terms_accepted=True,
        terms_version=TERMS_VERSION_CURRENT,
        marketing_opt_in=False,
        terms_current_version=TERMS_VERSION_CURRENT,
    )

    assert outcome.user.email == "a@x.dev"
    assert outcome.tokens.access_token == f"at:{outcome.user.id}"
    assert outcome.user.id in users.users


@pytest.mark.asyncio
async def test_sign_up_rejects_unaccepted_terms():
    svc, _, _, _ = _make_service()

    with pytest.raises(ValidationError, match="terms_must_be_accepted"):
        await svc.sign_up(
            email="a@x.dev",
            password="goodpass123",
            display_name="Alice",
            terms_accepted=False,
            terms_version=TERMS_VERSION_CURRENT,
            marketing_opt_in=False,
            terms_current_version=TERMS_VERSION_CURRENT,
        )


@pytest.mark.asyncio
async def test_sign_up_rejects_stale_terms_version():
    svc, _, _, _ = _make_service()

    with pytest.raises(ValidationError, match="terms_version_mismatch"):
        await svc.sign_up(
            email="a@x.dev",
            password="goodpass123",
            display_name="Alice",
            terms_accepted=True,
            terms_version="2025-01-01",
            marketing_opt_in=False,
            terms_current_version=TERMS_VERSION_CURRENT,
        )


@pytest.mark.asyncio
async def test_sign_up_rejects_weak_password():
    svc, _, _, _ = _make_service()

    with pytest.raises(ValidationError):
        await svc.sign_up(
            email="a@x.dev",
            password="short",
            display_name="Alice",
            terms_accepted=True,
            terms_version=TERMS_VERSION_CURRENT,
            marketing_opt_in=False,
            terms_current_version=TERMS_VERSION_CURRENT,
        )


# ── sign_in ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sign_in_happy_returns_tokens():
    users = FakeUserRepo()
    await users.create(
        user_id="u1",
        email="a@x.dev",
        password_hash=hash_password("goodpass123"),
        display_name="Alice",
    )
    svc, _, _, _ = _make_service(users=users)

    outcome = await svc.sign_in(email="a@x.dev", password="goodpass123")

    assert outcome.user.id == "u1"
    assert outcome.tokens.access_token == "at:u1"


@pytest.mark.asyncio
async def test_sign_in_rejects_unknown_email():
    svc, _, _, _ = _make_service()

    with pytest.raises(AuthError, match="invalid_credentials"):
        await svc.sign_in(email="ghost@x.dev", password="goodpass123")


@pytest.mark.asyncio
async def test_sign_in_rejects_bad_password():
    users = FakeUserRepo()
    await users.create(
        user_id="u1",
        email="a@x.dev",
        password_hash=hash_password("goodpass123"),
        display_name="Alice",
    )
    svc, _, _, _ = _make_service(users=users)

    with pytest.raises(AuthError, match="invalid_credentials"):
        await svc.sign_in(email="a@x.dev", password="wrongpass1234")


# ── get_me_with_vehicle ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_me_user_not_found_raises():
    svc, _, _, shop = _make_service()
    with pytest.raises(NotFoundError, match="user_not_found"):
        await svc.get_me_with_vehicle("missing", shop=shop)


@pytest.mark.asyncio
async def test_me_returns_user_without_vehicle_when_none_equipped():
    users = FakeUserRepo()
    await users.create(
        user_id="u1",
        email="a@x.dev",
        password_hash="x",
        display_name="Alice",
    )
    svc, _, _, shop = _make_service(users=users)

    user, vehicle = await svc.get_me_with_vehicle("u1", shop=shop)

    assert user.id == "u1"
    assert vehicle is None


@pytest.mark.asyncio
async def test_me_returns_user_with_vehicle_when_equipped():
    users = FakeUserRepo()
    await users.create(
        user_id="u1",
        email="a@x.dev",
        password_hash="x",
        display_name="Alice",
    )
    seeded: User = users.users["u1"]
    seeded.equipped_vehicle_item_id = "car1"
    shop = FakeShopRepo(
        render_metas={
            "car1": {
                "icon": "🚗",
                "body_color": "#abc123",
                "roof_color": "#000000",
            }
        }
    )
    svc, _, _, _ = _make_service(users=users, shop=shop)

    user, vehicle = await svc.get_me_with_vehicle("u1", shop=shop)

    assert user.id == "u1"
    assert vehicle is not None
    assert vehicle.icon == "🚗"
    assert vehicle.body_color == "#abc123"
