"""User.public_name fallback.

Worth testing:
- When display_name is empty, fall back to email prefix
- When display_name is set, return it verbatim

NOT worth testing:
- Plain field reads / dataclass equality
"""
from __future__ import annotations

from tests.unit.fakes import make_user


def test_public_name_returns_display_name_when_set():
    user = make_user("u1", display_name="Alice")
    assert user.public_name() == "Alice"


def test_public_name_falls_back_to_email_prefix_when_display_blank():
    user = make_user("u1", email="alice@example.com", display_name="")
    assert user.public_name() == "alice"
