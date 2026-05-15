from __future__ import annotations

import pytest

from app.core.exceptions import ValidationError
from app.core.security import validate_password_strength


def test_accepts_letter_and_digit_password():
    validate_password_strength("Hunter2-Pass")
    validate_password_strength("a1234567")
    validate_password_strength("A" * 60 + "9" * 5)


def test_rejects_password_without_digit():
    with pytest.raises(ValidationError):
        validate_password_strength("alllettersonly")


def test_rejects_password_without_letter():
    with pytest.raises(ValidationError):
        validate_password_strength("12345678")


def test_rejects_too_short_password():
    with pytest.raises(ValidationError):
        validate_password_strength("a1b2")


def test_rejects_too_long_password():
    with pytest.raises(ValidationError):
        validate_password_strength("a1" + "x" * 200)
