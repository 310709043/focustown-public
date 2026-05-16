"""AWS SES v2 implementation of INotificationService.

Email is the only outbound channel SES handles; push lives in SNSNotifier
(stub-only this round). The adapter is built to fail closed: any boto3 error
is logged and swallowed so the password-reset endpoint never leaks
account-existence via a 500 response or timing skew. SES itself retries
transient delivery failures so we don't double-retry on top.
"""

from __future__ import annotations

import asyncio
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.logging import get_logger
from app.domain.notifications import IEmailSender

log = get_logger(__name__)


class SESNotifier(IEmailSender):
    def __init__(
        self,
        *,
        region: str,
        from_email: str,
        endpoint_url: str = "",
    ) -> None:
        if not from_email:
            raise RuntimeError("SESNotifier requires a non-empty from_email")
        self._from = from_email
        self._region = region

        kwargs: dict[str, Any] = {"region_name": region}
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        self._client = boto3.client("sesv2", **kwargs)

    async def send_email(self, *, to: str, subject: str, body: str) -> None:
        def _send() -> None:
            self._client.send_email(
                FromEmailAddress=self._from,
                Destination={"ToAddresses": [to]},
                Content={
                    "Simple": {
                        "Subject": {"Data": subject, "Charset": "UTF-8"},
                        "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
                    }
                },
            )

        try:
            await asyncio.to_thread(_send)
        except (ClientError, BotoCoreError) as exc:
            # Swallow on purpose — see module docstring. Operator gets a
            # structured log entry to investigate. Caller must treat email
            # as best-effort.
            log.warning("ses_send_email_failed", to=to, subject=subject, error=str(exc))

