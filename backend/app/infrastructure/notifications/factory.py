"""Notification backend factory — one source of truth for the email dispatch.

Mirrors ``storage/factory.py``: branches by ``settings.notifier_backend`` and
imports concrete adapters lazily, so the boto3 cost is only paid when an
operator opts in to SES. New email backends (SMTP, Postmark, ...) plug in
here with a single new branch; routers and services stay closed.

We expose only the email side because push isn't wired this round
(SNSNotifier is a stub). When push lands a sibling ``make_push_sender``
will appear here without changing this function.
"""

from __future__ import annotations

from app.core.config import Settings
from app.domain.notifications import IEmailSender
from app.infrastructure.notifications.log_notifier import LogNotifier


def make_email_sender(settings: Settings) -> IEmailSender:
    backend = settings.notifier_backend
    if backend == "log":
        return LogNotifier()
    if backend == "ses":
        # Lazy import so the boto3 import path is only walked when SES is
        # actually selected. Keeps cold-start cheap for the local_jwt /
        # log fallback that dev and CI use.
        from app.infrastructure.notifications.ses_notifier import SESNotifier

        return SESNotifier(
            region=settings.aws_region,
            from_email=settings.ses_from_email,
            endpoint_url=settings.ses_endpoint_url,
        )
    raise RuntimeError(f"unsupported notifier_backend: {backend}")
