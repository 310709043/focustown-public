"""Pin the email-sender dispatch in notifications/factory.py.

These tests ensure that flipping NOTIFIER_BACKEND swaps the concrete
adapter without any caller change — the OCP contract the dispatch
pattern is meant to keep.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.infrastructure.notifications.factory import make_email_sender
from app.infrastructure.notifications.log_notifier import LogNotifier


def _settings(**overrides: object) -> Settings:
    return Settings(**overrides)  # type: ignore[call-arg]


def test_make_email_sender_log_returns_log_notifier():
    s = _settings(notifier_backend="log")
    assert isinstance(make_email_sender(s), LogNotifier)


def test_make_email_sender_ses_returns_ses_notifier():
    s = _settings(
        notifier_backend="ses",
        ses_from_email="noreply@example.com",
        aws_region="ap-northeast-1",
    )
    sender = make_email_sender(s)
    from app.infrastructure.notifications.ses_notifier import SESNotifier

    assert isinstance(sender, SESNotifier)


def test_make_email_sender_unknown_backend_raises():
    s = _settings(notifier_backend="log")
    object.__setattr__(s, "notifier_backend", "smtp")  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="unsupported notifier_backend"):
        make_email_sender(s)
