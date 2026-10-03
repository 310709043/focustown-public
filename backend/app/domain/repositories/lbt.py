"""Ports for LowBatteryTown: live session state and safety reports."""
from __future__ import annotations

from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Protocol

from app.domain.models.lbt import LbtConversation, LbtWaiting


@dataclass(frozen=True, slots=True)
class LbtTranscriptLine:
    id: str
    from_guest: str
    text: str
    at: datetime

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "from": self.from_guest,
            "text": self.text,
            "at": self.at.isoformat(),
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> LbtTranscriptLine:
        return cls(
            id=str(raw["id"]),
            from_guest=str(raw["from"]),
            text=str(raw["text"]),
            at=datetime.fromisoformat(str(raw["at"])),
        )


class ILbtStore(Protocol):
    """Ephemeral session state (Redis in production).

    Nothing here is meant to outlive a day: conversations and transcripts
    expire on their own. Reports are the only durable record and go through
    ``ILbtReportRepo``.
    """

    # presence
    async def touch_online(self, guest_id: str, now: datetime) -> None: ...
    async def drop_online(self, guest_id: str) -> None: ...
    async def last_seen(self, guest_id: str) -> datetime | None: ...
    async def count_online(self, since: datetime) -> int: ...
    async def prune_online(self, before: datetime) -> None: ...

    # waiting room
    async def enqueue(self, waiting: LbtWaiting) -> None: ...
    async def dequeue(self, guest_id: str) -> bool: ...
    async def list_waiting(self) -> list[LbtWaiting]: ...
    def pairing_lock(self) -> AbstractAsyncContextManager[bool]: ...

    # conversations
    async def save_conversation(self, conversation: LbtConversation) -> None: ...
    async def get_conversation(self, conversation_id: str) -> LbtConversation | None: ...
    async def conversation_id_of(self, guest_id: str) -> str | None: ...
    async def last_conversation_id_of(self, guest_id: str) -> str | None: ...
    async def active_conversation_ids(self) -> list[str]: ...
    async def close_conversation(
        self, conversation: LbtConversation, *, keep_for: timedelta
    ) -> None: ...
    async def append_line(self, conversation_id: str, line: LbtTranscriptLine) -> None: ...
    async def transcript(self, conversation_id: str) -> list[LbtTranscriptLine]: ...

    # safety
    async def block_pair(self, guest_a: str, guest_b: str, ttl: timedelta) -> None: ...
    async def blocked_for(self, guest_id: str) -> set[str]: ...


@dataclass(frozen=True, slots=True)
class LbtReportRecord:
    id: str
    conversation_id: str
    reporter_guest_id: str
    reported_guest_id: str
    reason: str
    note: str | None
    transcript: list[dict[str, str]]
    reporter_profile: dict[str, object]
    reported_profile: dict[str, object]
    status: str
    created_at: datetime


class ILbtReportRepo(Protocol):
    async def create(self, record: LbtReportRecord) -> None: ...
    async def list_recent(self, *, status: str | None, limit: int) -> list[LbtReportRecord]: ...
    async def set_status(self, report_id: str, status: str) -> bool: ...
