"""Unit tests for ``app.core.security`` — password + JWT primitives.

Worth testing (every auth path depends on these holding):

- hash_password / verify_password round-trip on the same plaintext;
  verify on a tampered hash returns False
- validate_password_strength enforces: ≥8 chars, ≤128 chars, at least
  one letter, at least one digit (raises ValidationError otherwise)
- create_token / decode_token round-trip on a single Settings instance
  for both access + refresh kinds with the right `type` claim
- create_token with an unknown kind raises ValueError (callers learn at
  the integration boundary, not via a silent bad-token issue)
- decode_token on a tampered token raises AuthError (one of the gates
  that keeps a forged JWT out of /me)
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.core.exceptions import AuthError, ValidationError
from app.core.security import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    create_token,
    decode_token,
    hash_password,
    validate_password_strength,
    verify_password,
)


def _settings() -> Settings:
    # Settings() reads env; conftest already injects a valid APP_SECRET_KEY.
    return Settings()  # type: ignore[call-arg]


# ── password hash / verify ─────────────────────────────────────────────────


def test_hash_and_verify_round_trip() -> None:
    hashed = hash_password("Sup3rSecret!aaa")

    assert verify_password("Sup3rSecret!aaa", hashed) is True


def test_verify_rejects_wrong_password() -> None:
    hashed = hash_password("Sup3rSecret!aaa")

    assert verify_password("wrong-password-aaa", hashed) is False


def test_hash_produces_a_different_string_each_call_for_same_input() -> None:
    # Bcrypt salts internally — equal hashes from the same plaintext
    # would indicate a salt-collapsing regression.
    a = hash_password("Sup3rSecret!aaa")
    b = hash_password("Sup3rSecret!aaa")

    assert a != b


# ── password strength ──────────────────────────────────────────────────────


def test_strength_accepts_min_length_letter_plus_digit() -> None:
    # PASSWORD_MIN_LENGTH chars with both letter + digit — must pass.
    validate_password_strength("a" * (PASSWORD_MIN_LENGTH - 1) + "1")


def test_strength_rejects_below_min_length() -> None:
    with pytest.raises(ValidationError):
        validate_password_strength("ab1")


def test_strength_rejects_letters_only() -> None:
    with pytest.raises(ValidationError):
        validate_password_strength("abcdefgh")


def test_strength_rejects_digits_only() -> None:
    with pytest.raises(ValidationError):
        validate_password_strength("12345678")


def test_strength_accepts_at_max_length() -> None:
    validate_password_strength("a" * (PASSWORD_MAX_LENGTH - 1) + "1")


def test_strength_rejects_above_max_length() -> None:
    with pytest.raises(ValidationError):
        validate_password_strength("a" * PASSWORD_MAX_LENGTH + "1")


# ── JWT create / decode round-trip ─────────────────────────────────────────


def test_create_and_decode_access_token_round_trip() -> None:
    s = _settings()
    token = create_token(s, "user-1", kind="access")

    claims = decode_token(s, token)

    assert claims["sub"] == "user-1"
    assert claims["type"] == "access"


def test_create_refresh_token_carries_refresh_type_claim() -> None:
    s = _settings()
    token = create_token(s, "user-1", kind="refresh")

    claims = decode_token(s, token)

    assert claims["type"] == "refresh"


def test_create_token_with_unknown_kind_raises_value_error() -> None:
    s = _settings()

    with pytest.raises(ValueError, match="unknown token kind"):
        create_token(s, "user-1", kind="bogus")


def test_create_token_merges_extra_claims_into_payload() -> None:
    s = _settings()
    token = create_token(s, "user-1", kind="access", extra={"role": "admin"})

    claims = decode_token(s, token)

    assert claims["role"] == "admin"


def test_decode_token_rejects_tampered_signature() -> None:
    s = _settings()
    token = create_token(s, "user-1", kind="access")
    # Flip a single character in the signature.
    tampered = token[:-2] + ("aa" if token[-1] != "a" else "bb")

    with pytest.raises(AuthError):
        decode_token(s, tampered)


def test_decode_token_rejects_garbage_string() -> None:
    s = _settings()

    with pytest.raises(AuthError):
        decode_token(s, "not.a.jwt.at.all")
