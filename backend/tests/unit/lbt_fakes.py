"""In-memory test doubles for LowBatteryTown ports."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.domain.models.lbt import LbtConversation, LbtWaiting
from app.domain.repositories.lbt import (
    ILbtReportRepo,
    ILbtStore,
    LbtReportRecord,
    LbtTranscriptLine,
)


@dataclass
class InMemoryLbtStore(ILbtStore):
    online: dict[str, datetime] = field(default_factory=dict)
    queue: dict[str, LbtWaiting] = field(default_factory=dict)
    conversations: dict[str, LbtConversation] = field(default_factory=dict)
    active: set[str] = field(default_factory=set)
    guest_conv: dict[str, str] = field(default_factory=dict)
    guest_last: dict[str, str] = field(default_factory=dict)
    transcripts: dict[str, list[LbtTranscriptLine]] = field(default_factory=dict)
    blocked: dict[str, set[str]] = field(default_factory=dict)
    votes: dict[str, set[str]] = field(default_factory=dict)
    lock_held: bool = False
    # Yield to the event loop inside reads/writes so tests can interleave
    # two coroutines the way two API processes would.
    interleave: bool = False
    closed_keep_for: dict[str, timedelta] = field(default_factory=dict)

    async def touch_online(self, guest_id: str, now: datetime) -> None:
        self.online[guest_id] = now

    async def drop_online(self, guest_id: str) -> None:
        self.online.pop(guest_id, None)

    async def last_seen(self, guest_id: str) -> datetime | None:
        return self.online.get(guest_id)

    async def count_online(self, since: datetime) -> int:
        return sum(1 for seen in self.online.values() if seen >= since)

    async def prune_online(self, before: datetime) -> None:
        self.online = {g: t for g, t in self.online.items() if t >= before}

    async def enqueue(self, waiting: LbtWaiting) -> None:
        self.queue[waiting.guest_id] = waiting

    async def dequeue(self, guest_id: str) -> bool:
        return self.queue.pop(guest_id, None) is not None

    async def list_waiting(self) -> list[LbtWaiting]:
        return sorted(self.queue.values(), key=lambda w: w.joined_at)

    @asynccontextmanager
    async def pairing_lock(self) -> AsyncIterator[bool]:
        if self.lock_held:
            yield False
            return
        self.lock_held = True
        try:
            yield True
        finally:
            self.lock_held = False

    async def save_conversation(self, conversation: LbtConversation) -> None:
        await self._yield()
        self.conversations[conversation.id] = conversation
        self.active.add(conversation.id)
        self.guest_conv[conversation.guest_a] = conversation.id
        self.guest_conv[conversation.guest_b] = conversation.id

    async def _yield(self) -> None:
        if self.interleave:
            await asyncio.sleep(0)

    async def get_conversation(self, conversation_id: str) -> LbtConversation | None:
        await self._yield()
        return self.conversations.get(conversation_id)

    async def conversation_id_of(self, guest_id: str) -> str | None:
        return self.guest_conv.get(guest_id)

    async def last_conversation_id_of(self, guest_id: str) -> str | None:
        return self.guest_last.get(guest_id)

    async def active_conversation_ids(self) -> list[str]:
        return sorted(self.active)

    async def close_conversation(
        self, conversation: LbtConversation, *, keep_for: timedelta
    ) -> None:
        self.active.discard(conversation.id)
        for guest in (conversation.guest_a, conversation.guest_b):
            self.guest_conv.pop(guest, None)
            self.guest_last[guest] = conversation.id
        self.closed_keep_for[conversation.id] = keep_for
        self.votes.pop(conversation.id, None)

    async def add_extend_vote(self, conversation_id: str, guest_id: str) -> bool:
        # Single synchronous step: mirrors the atomic Lua script.
        votes = self.votes.setdefault(conversation_id, set())
        votes.add(guest_id)
        if len(votes) >= 2:
            del self.votes[conversation_id]
            return True
        return False

    async def extend_votes(self, conversation_id: str) -> set[str]:
        return set(self.votes.get(conversation_id, set()))

    async def append_line(self, conversation_id: str, line: LbtTranscriptLine) -> None:
        self.transcripts.setdefault(conversation_id, []).append(line)

    async def transcript(self, conversation_id: str) -> list[LbtTranscriptLine]:
        return list(self.transcripts.get(conversation_id, []))

    async def block_pair(self, guest_a: str, guest_b: str, ttl: timedelta) -> None:
        self.blocked.setdefault(guest_a, set()).add(guest_b)
        self.blocked.setdefault(guest_b, set()).add(guest_a)

    async def blocked_for(self, guest_id: str) -> set[str]:
        return set(self.blocked.get(guest_id, set()))


@dataclass
class InMemoryLbtReportRepo(ILbtReportRepo):
    records: list[LbtReportRecord] = field(default_factory=list)

    async def create(self, record: LbtReportRecord) -> None:
        self.records.append(record)

    async def list_recent(self, *, status: str | None, limit: int) -> list[LbtReportRecord]:
        rows = [r for r in reversed(self.records) if status is None or r.status == status]
        return rows[:limit]

    async def set_status(self, report_id: str, status: str) -> bool:
        return any(r.id == report_id for r in self.records)
