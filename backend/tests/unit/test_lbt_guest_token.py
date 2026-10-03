"""Anonymous guest tokens must not be interchangeable with user tokens."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt

from app.core.config import Settings
from app.core.exceptions import AuthError
from app.core.security import (
    GUEST_ID_PREFIX,
    create_guest_token,
    create_token,
    decode_guest_token,
    new_guest_id,
)


@pytest.fixture
def settings() -> Settings:
    return Settings(app_secret_key="k" * 40, database_url="postgresql+asyncpg://u:p@h/db")


def test_guest_ids_are_prefixed_and_unique():
    ids = {new_guest_id() for _ in range(50)}

    assert (len(ids), all(i.startswith(GUEST_ID_PREFIX) for i in ids)) == (50, True)


def test_round_trip_returns_the_guest_id(settings):
    token, _ = create_guest_token(settings, "g_abc")

    assert decode_guest_token(settings, token) == "g_abc"


def test_expiry_follows_the_configured_ttl(settings):
    _, expires_at = create_guest_token(settings, "g_abc")

    expected = datetime.now(UTC) + timedelta(hours=settings.lbt_guest_token_ttl_hours)
    assert abs((expires_at - expected).total_seconds()) < 5


def test_a_user_access_token_is_rejected_as_a_guest_token(settings):
    token = create_token(settings, "user-1", kind="access")

    with pytest.raises(AuthError, match="not_a_guest_token"):
        decode_guest_token(settings, token)


def test_a_guest_token_with_a_non_guest_subject_is_rejected(settings):
    token = jwt.encode(
        {"sub": "user-1", "type": "lbt_guest", "exp": datetime.now(UTC) + timedelta(hours=1)},
        settings.app_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(AuthError, match="invalid_guest_token"):
        decode_guest_token(settings, token)


def test_an_expired_guest_token_is_rejected(settings):
    token = jwt.encode(
        {"sub": "g_x", "type": "lbt_guest", "exp": datetime.now(UTC) - timedelta(seconds=1)},
        settings.app_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(AuthError):
        decode_guest_token(settings, token)


def test_a_token_signed_with_another_key_is_rejected(settings):
    token = jwt.encode(
        {"sub": "g_x", "type": "lbt_guest", "exp": datetime.now(UTC) + timedelta(hours=1)},
        "z" * 40,
        algorithm=settings.jwt_algorithm,
    )

    with pytest.raises(AuthError):
        decode_guest_token(settings, token)


def test_invalid_open_hours_fail_settings_validation():
    with pytest.raises(ValueError, match="open hours"):
        Settings(
            app_secret_key="k" * 40,
            database_url="postgresql+asyncpg://u:p@h/db",
            lbt_open_hours="25:00-26:00",
        )
