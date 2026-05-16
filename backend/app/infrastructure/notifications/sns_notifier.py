"""Stub SNSNotifier — push delivery deferred to a future round.

The class exists so the dispatch table (notifications/factory.py) has a
typed parity slot for push and a follow-up agent can fill the body without
introducing a new module. Both methods raise so an accidental wire-up
fails loudly rather than dropping messages on the floor.
"""

from __future__ import annotations

from app.domain.notifications import IPushSender


class SNSNotifier(IPushSender):
    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        del user_id, title, body
        raise NotImplementedError("SNSNotifier not implemented yet")
