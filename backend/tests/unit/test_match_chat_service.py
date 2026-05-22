"""Unit tests for MatchChatService + MatchAgendaService.

Covers participant gating, validation, fan-out, and agenda state
transitions.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.clock import IClock
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.ids import IIdGenerator
from app.domain.models import Match, MatchStatus
from app.domain.repositories.match_realtime_repo import (
    IMatchAgendaRepo,
    IMatchMessageRepo,
    MatchAgendaItem,
    MatchMessage,
)
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.services.match_chat_service import (
    MatchAgendaService,
    MatchChatService,
)
from tests.unit.fakes import FakeMatchRepo


class CounterIds(IIdGenerator):
    def __init__(self) -> None:
        self._n = itertools.count(1)

    def new_id(self) -> str:
        return f"id-{next(self._n)}"


class FrozenClock(IClock):
    def now(self) -> datetime:  # type: ignore[override]
        return datetime(2026, 5, 19, 12, 0, tzinfo=UTC)


class RecordingPublisher(IRealtimePublisher):
    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, Any]]] = []

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
        self.published.append((channel, payload))


class FakeMessageRepo(IMatchMessageRepo):
    def __init__(self) -> None:
        self.rows: list[MatchMessage] = []

    async def list_by_match(
        self,
        match_id: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[MatchMessage]:
        out = [r for r in self.rows if r.match_id == match_id]
        # Fakes don't decode cursors — tests assert the cursor codec
        # round-trip in test_pagination.py; here we only need the limit
        # over-fetch contract for service-layer behaviour tests.
        return sorted(out, key=lambda r: r.created_at, reverse=True)[: limit + 1]

    async def create(
        self,
        *,
        message_id: str,
        match_id: str,
        sender_id: str,
        kind: str,
        body: str,
        metadata: dict[str, Any] | None,
    ) -> MatchMessage:
        msg = MatchMessage(
            id=message_id,
            match_id=match_id,
            sender_id=sender_id,
            kind=kind,
            body=body,
            metadata=metadata,
            created_at=datetime.now(UTC),
        )
        self.rows.append(msg)
        return msg


class FakeAgendaRepo(IMatchAgendaRepo):
    def __init__(self) -> None:
        self.rows: dict[str, MatchAgendaItem] = {}

    async def list_by_match(self, match_id: str) -> list[MatchAgendaItem]:
        return sorted(
            (r for r in self.rows.values() if r.match_id == match_id),
            key=lambda r: r.position,
        )

    async def get(self, item_id: str) -> MatchAgendaItem | None:
        return self.rows.get(item_id)

    async def create(
        self,
        *,
        item_id: str,
        match_id: str,
        position: int,
        body: str,
        created_by: str,
    ) -> MatchAgendaItem:
        now = datetime.now(UTC)
        item = MatchAgendaItem(
            id=item_id,
            match_id=match_id,
            position=position,
            body=body,
            status="pending",
            created_by=created_by,
            checked_by=None,
            checked_at=None,
            created_at=now,
            updated_at=now,
        )
        self.rows[item_id] = item
        return item

    async def update(
        self,
        item_id: str,
        *,
        body: str | None = None,
        status: str | None = None,
        position: int | None = None,
        checked_by: str | None = None,
        checked_at: datetime | None = None,
    ) -> MatchAgendaItem | None:
        row = self.rows.get(item_id)
        if row is None:
            return None
        updated = MatchAgendaItem(
            id=row.id,
            match_id=row.match_id,
            position=position if position is not None else row.position,
            body=body if body is not None else row.body,
            status=status if status is not None else row.status,
            created_by=row.created_by,
            checked_by=checked_by if checked_by is not None else row.checked_by,
            checked_at=checked_at if checked_at is not None else row.checked_at,
            created_at=row.created_at,
            updated_at=datetime.now(UTC),
        )
        self.rows[item_id] = updated
        return updated

    async def delete(self, item_id: str) -> None:
        self.rows.pop(item_id, None)

    async def next_position(self, match_id: str) -> int:
        positions = [
            r.position for r in self.rows.values() if r.match_id == match_id
        ]
        return (max(positions) + 1) if positions else 0


def _match(*, mid: str = "m1", a: str = "alice", b: str = "bob") -> Match:
    return Match(
        id=mid,
        requester_id=a,
        candidate_id=b,
        compatibility=80,
        reason="seed",
        status=MatchStatus.ACCEPTED,
        created_at=datetime(2026, 5, 19, 11, 0, tzinfo=UTC),
        updated_at=datetime(2026, 5, 19, 11, 0, tzinfo=UTC),
    )


def _chat_service() -> tuple[
    MatchChatService, FakeMessageRepo, FakeMatchRepo, RecordingPublisher
]:
    messages = FakeMessageRepo()
    matches = FakeMatchRepo()
    m = _match()
    matches.rows[m.id] = m
    pub = RecordingPublisher()
    svc = MatchChatService(
        messages=messages,
        matches=matches,
        publisher=pub,
        ids=CounterIds(),
        clock=FrozenClock(),
    )
    return svc, messages, matches, pub


def _agenda_service() -> tuple[
    MatchAgendaService, FakeAgendaRepo, FakeMatchRepo, RecordingPublisher
]:
    agenda = FakeAgendaRepo()
    matches = FakeMatchRepo()
    m = _match()
    matches.rows[m.id] = m
    pub = RecordingPublisher()
    svc = MatchAgendaService(
        agenda=agenda,
        matches=matches,
        publisher=pub,
        ids=CounterIds(),
        clock=FrozenClock(),
    )
    return svc, agenda, matches, pub


# ── chat ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_creates_message_and_publishes_to_room() -> None:
    svc, messages, _, pub = _chat_service()
    msg = await svc.send(
        sender_id="alice",
        match_id="m1",
        kind="text",
        body="hi bob",
        metadata=None,
    )
    assert msg.body == "hi bob"
    assert msg.sender_id == "alice"
    assert len(messages.rows) == 1
    assert pub.published[-1][0] == "room:m1"
    assert pub.published[-1][1]["type"] == "chat.message"


@pytest.mark.asyncio
async def test_send_rejects_non_member() -> None:
    svc, *_ = _chat_service()
    with pytest.raises(ForbiddenError):
        await svc.send(
            sender_id="stranger",
            match_id="m1",
            kind="text",
            body="hi",
            metadata=None,
        )


@pytest.mark.asyncio
async def test_send_rejects_empty_body() -> None:
    svc, *_ = _chat_service()
    with pytest.raises(ValidationError):
        await svc.send(
            sender_id="alice",
            match_id="m1",
            kind="text",
            body="   ",
            metadata=None,
        )


@pytest.mark.asyncio
async def test_send_rejects_unknown_match() -> None:
    svc, *_ = _chat_service()
    with pytest.raises(NotFoundError):
        await svc.send(
            sender_id="alice",
            match_id="ghost",
            kind="text",
            body="hi",
            metadata=None,
        )


@pytest.mark.asyncio
async def test_list_messages_returns_scrollback_for_member() -> None:
    svc, *_ = _chat_service()
    await svc.send(
        sender_id="alice", match_id="m1", kind="text", body="hi", metadata=None
    )
    await svc.send(
        sender_id="bob", match_id="m1", kind="text", body="yo", metadata=None
    )
    rows = await svc.list_messages(
        viewer_id="bob", match_id="m1", cursor=None, limit=10
    )
    assert len(rows) == 2


# ── agenda ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_agenda_item_assigns_next_position() -> None:
    svc, agenda, _, _ = _agenda_service()
    a = await svc.create_item(creator_id="alice", match_id="m1", body="first")
    b = await svc.create_item(creator_id="bob", match_id="m1", body="second")
    assert a.position == 0
    assert b.position == 1


@pytest.mark.asyncio
async def test_create_agenda_item_rejects_non_member() -> None:
    svc, *_ = _agenda_service()
    with pytest.raises(ForbiddenError):
        await svc.create_item(
            creator_id="stranger", match_id="m1", body="x"
        )


@pytest.mark.asyncio
async def test_update_to_done_records_checked_by_and_time() -> None:
    svc, *_ = _agenda_service()
    item = await svc.create_item(
        creator_id="alice", match_id="m1", body="x"
    )
    updated = await svc.update_item(
        actor_id="bob", item_id=item.id, status="done"
    )
    assert updated.status == "done"
    assert updated.checked_by == "bob"
    assert updated.checked_at is not None


@pytest.mark.asyncio
async def test_update_invalid_status_rejected() -> None:
    svc, *_ = _agenda_service()
    item = await svc.create_item(
        creator_id="alice", match_id="m1", body="x"
    )
    with pytest.raises(ValidationError):
        await svc.update_item(
            actor_id="alice", item_id=item.id, status="exploding"
        )


@pytest.mark.asyncio
async def test_delete_removes_item_and_broadcasts() -> None:
    svc, agenda, _, pub = _agenda_service()
    item = await svc.create_item(
        creator_id="alice", match_id="m1", body="x"
    )
    pub.published.clear()
    await svc.delete_item(actor_id="alice", item_id=item.id)
    assert item.id not in agenda.rows
    assert pub.published[-1][1]["type"] == "agenda.item_removed"


@pytest.mark.asyncio
async def test_delete_unknown_item_is_silent() -> None:
    svc, *_ = _agenda_service()
    # No raise even though id doesn't exist — DELETE semantics.
    await svc.delete_item(actor_id="alice", item_id="ghost")
