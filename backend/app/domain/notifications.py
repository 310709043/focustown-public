from __future__ import annotations

from typing import Protocol


class INotificationService(Protocol):
    """Port for outbound notifications (email, push, sms).

    Lives in domain so services depend only on this Protocol; the concrete
    adapter (LogNotifier in dev, SESNotifier in prod) is wired in `core/deps.py`.
    """

    async def send_email(self, *, to: str, subject: str, body: str) -> None: ...
    async def send_push(self, *, user_id: str, title: str, body: str) -> None: ...
