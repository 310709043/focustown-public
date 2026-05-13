from __future__ import annotations

from typing import Protocol


class INotificationService(Protocol):
    async def send_email(self, *, to: str, subject: str, body: str) -> None: ...
    async def send_push(self, *, user_id: str, title: str, body: str) -> None: ...
