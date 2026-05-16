from __future__ import annotations

from typing import Protocol


class IEmailSender(Protocol):
    """Email-only notification port.

    Services that need to send email (password reset, transactional alerts)
    depend on this narrower Protocol so they can never accidentally invoke
    push delivery — per ISP, callers should depend on the smallest surface
    that meets their need.
    """

    async def send_email(self, *, to: str, subject: str, body: str) -> None: ...


class IPushSender(Protocol):
    """Push-only notification port.

    Mirror of IEmailSender for the push delivery channel.
    """

    async def send_push(self, *, user_id: str, title: str, body: str) -> None: ...


class INotificationService(IEmailSender, IPushSender, Protocol):
    """Composed port for callers that genuinely need both channels.

    Most services should depend on IEmailSender or IPushSender instead.
    """
