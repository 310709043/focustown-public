"""Regression tests for the F1-F5 security-review fixes.

Each test asserts the exact behaviour the fix was meant to provide so that a
future refactor cannot silently weaken it.
"""
from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from pydantic import ValidationError as PydValidationError

from app.api.v1.auth.schemas import ResetPasswordRequest, SignUpRequest
from app.core.config import Settings
from app.core.deps import get_client_ip
from app.domain.services.password_reset_service import _sanitize_for_email

# ── F1: X-Forwarded-For trusted-proxy verification ───────────────────────

def _make_request(*, peer: str | None, xff: str | None = None):
    headers_dict = {}
    if xff is not None:
        headers_dict["x-forwarded-for"] = xff

    class _Headers:
        def __init__(self, d):
            self._d = d

        def get(self, key, default=None):
            return self._d.get(key.lower(), default)

    return SimpleNamespace(
        client=SimpleNamespace(host=peer) if peer else None,
        headers=_Headers(headers_dict),
    )


def _settings(**overrides) -> Settings:
    base = {
        "app_secret_key": "x" * 40,
        "database_url": "postgresql+asyncpg://x:x@h/db",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[call-arg]


def test_xff_ignored_when_peer_is_not_trusted():
    settings = _settings(app_trusted_proxies="")
    req = _make_request(peer="203.0.113.5", xff="1.2.3.4")
    assert get_client_ip(req, settings) == "203.0.113.5"


def test_xff_honoured_when_peer_is_in_trusted_cidr():
    settings = _settings(app_trusted_proxies="10.0.0.0/8")
    req = _make_request(peer="10.5.5.5", xff="198.51.100.7")
    assert get_client_ip(req, settings) == "198.51.100.7"


def test_xff_rejected_when_value_is_garbage():
    settings = _settings(app_trusted_proxies="10.0.0.0/8")
    req = _make_request(peer="10.5.5.5", xff="not-an-ip\r\n; DROP TABLE users")
    # Falls back to peer when XFF first hop is not a valid IP.
    assert get_client_ip(req, settings) == "10.5.5.5"


def test_returns_none_when_peer_missing_and_xff_invalid():
    settings = _settings(app_trusted_proxies="")
    req = _make_request(peer=None, xff="anything")
    assert get_client_ip(req, settings) is None


def test_peer_garbage_input_returns_none():
    settings = _settings(app_trusted_proxies="")
    req = _make_request(peer="garbage")
    assert get_client_ip(req, settings) is None


# ── F2: reset token min_length aligned with issuer ───────────────────────

def test_reset_password_request_rejects_short_token():
    with pytest.raises(PydValidationError):
        ResetPasswordRequest(token="a" * 16, new_password="Hunter2-pass")


def test_reset_password_request_accepts_issuer_length_token():
    payload = ResetPasswordRequest(token="a" * 43, new_password="Hunter2-pass")
    assert payload.token == "a" * 43


# ── F3: display_name control-character filter ────────────────────────────

@pytest.mark.parametrize(
    "bad_name",
    [
        "Alice\r\nBcc: attacker@evil",
        "Alice\nname",
        "Alice\tname",
        "Alice\x00",
        "Alice\x1bname",
        "Alice\x7f",
    ],
)
def test_signup_rejects_display_name_with_control_chars(bad_name):
    with pytest.raises(PydValidationError):
        SignUpRequest(
            email="a@example.com",
            password="Hunter2-pass",
            display_name=bad_name,
            terms_accepted=True,
            terms_version="2026-05-14",
            marketing_opt_in=False,
        )


def test_sanitize_for_email_strips_controls():
    assert _sanitize_for_email("Alice\r\nBcc: x") == "AliceBcc: x"
    assert _sanitize_for_email("normal name") == "normal name"
    assert _sanitize_for_email("中文名稱") == "中文名稱"


# ── F4: reset_url_base validation ────────────────────────────────────────

def test_reset_url_base_must_be_https_in_production():
    with pytest.raises(PydValidationError):
        Settings(  # type: ignore[call-arg]
            app_secret_key="x" * 40,
            database_url="postgresql+asyncpg://x:x@h/db",
            app_env="production",
            reset_url_base="http://example.com/reset",
        )


def test_reset_url_base_https_accepted_in_production():
    s = Settings(  # type: ignore[call-arg]
        app_secret_key="x" * 40,
        database_url="postgresql+asyncpg://x:x@h/db",
        app_env="production",
        reset_url_base="https://app.focustown.example/reset-password",
    )
    assert s.reset_url_base.startswith("https://")


def test_reset_url_base_must_be_absolute_url():
    with pytest.raises(PydValidationError):
        Settings(  # type: ignore[call-arg]
            app_secret_key="x" * 40,
            database_url="postgresql+asyncpg://x:x@h/db",
            reset_url_base="/relative/path",
        )


def test_reset_url_base_http_allowed_in_development():
    s = Settings(  # type: ignore[call-arg]
        app_secret_key="x" * 40,
        database_url="postgresql+asyncpg://x:x@h/db",
        app_env="development",
        reset_url_base="http://localhost:3000/reset-password",
    )
    assert s.reset_url_base == "http://localhost:3000/reset-password"


# Guardrail: pydantic-settings reads env first, so clear the relevant var
# so the test isn't subverted by the developer's local environment.
@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    for v in ["RESET_URL_BASE", "APP_ENV", "APP_TRUSTED_PROXIES"]:
        monkeypatch.delenv(v, raising=False)
    yield
    os.environ.pop("RESET_URL_BASE", None)
