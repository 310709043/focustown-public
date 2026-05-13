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
