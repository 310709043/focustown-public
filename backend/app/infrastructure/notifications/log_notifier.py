from __future__ import annotations

from app.core.logging import get_logger
from app.domain.notifications import INotificationService

log = get_logger(__name__)


class LogNotifier(INotificationService):
    """Dev impl: writes a structured log instead of dispatching a real message.

    v2 swap: SESNotifier (email via Amazon SES) + SNSNotifier (push via SNS/FCM).
    """

    async def send_email(self, *, to: str, subject: str, body: str) -> None:
        log.info("email_dispatch", to=to, subject=subject, body=body)

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        log.info("push_dispatch", user_id=user_id, title=title, body=body)
