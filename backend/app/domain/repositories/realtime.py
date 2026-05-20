from __future__ import annotations

from typing import Any, Protocol


class IRealtimePublisher(Protocol):
    """Publish-only port. Subscribers live inside infrastructure."""

    async def publish(self, channel: str, payload: dict[str, Any]) -> None: ...

    @staticmethod
    def user_channel(user_id: str) -> str:
        return f"user:{user_id}"

    @staticmethod
    def room_channel(room_id: str) -> str:
        return f"room:{room_id}"

    @staticmethod
    def station_channel(kind: str, scope_id: str) -> str:
        """Cohort music station fan-out channel.

        ``kind`` is ``"city"`` or ``"pair"``; ``scope_id`` is the city id
        (single city for MVP) or the match id. Single PUBLISH per song
        advance reaches every connected process via Redis Pub/Sub; each
        process's WSManager fans out to local sockets.
        """
        return f"station:{kind}:{scope_id}"
