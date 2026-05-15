from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.events import EventBus
from app.domain.events.session import (
    SessionAbandoned,
    SessionCompleted,
    SessionStarted,
)
from app.domain.services.session_presence_subscriber import SessionPresenceLink
from tests.unit.fakes import FakePresenceStatusWriter

_NOW = datetime(2026, 5, 15, 12, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_session_started_flips_self_to_focus() -> None:
    writer = FakePresenceStatusWriter()
    bus = EventBus()
    SessionPresenceLink(writer=writer).register(bus)

    await bus.publish(
        SessionStarted(
            session_id="s1",
            user_id="u-alice",
            partner_user_id=None,
            started_at=_NOW,
        )
    )

    assert writer.calls == [("u-alice", "focus")]


@pytest.mark.asyncio
async def test_session_started_flips_partner_to_focus_when_matched() -> None:
    writer = FakePresenceStatusWriter()
    bus = EventBus()
    SessionPresenceLink(writer=writer).register(bus)

    await bus.publish(
        SessionStarted(
            session_id="s1",
            user_id="u-alice",
            partner_user_id="u-bob",
            started_at=_NOW,
        )
    )

    assert writer.calls == [("u-alice", "focus"), ("u-bob", "focus")]


@pytest.mark.asyncio
async def test_session_completed_flips_both_to_afk() -> None:
    writer = FakePresenceStatusWriter()
    bus = EventBus()
    SessionPresenceLink(writer=writer).register(bus)

    await bus.publish(
        SessionCompleted(
            session_id="s1",
            user_id="u-alice",
            partner_user_id="u-bob",
            duration_seconds=1500,
            ended_at=_NOW,
        )
    )

    assert writer.calls == [("u-alice", "afk"), ("u-bob", "afk")]


@pytest.mark.asyncio
async def test_session_abandoned_flips_self_to_afk() -> None:
    writer = FakePresenceStatusWriter()
    bus = EventBus()
    SessionPresenceLink(writer=writer).register(bus)

    await bus.publish(
        SessionAbandoned(
            session_id="s1",
            user_id="u-alice",
            ended_at=_NOW,
        )
    )

    assert writer.calls == [("u-alice", "afk")]


@pytest.mark.asyncio
async def test_register_is_not_idempotent_so_callers_must_register_once() -> None:
    """Guard rail: double-registration on the SAME EventBus DOES double-fire.

    The EventBus stores handlers in a list (see ``core/events.py``); calling
    ``register`` twice appends both. Our composition root must call
    ``SessionPresenceLink(...).register(bus)`` exactly once. This test
    documents that contract so a future refactor doesn't accidentally
    introduce double registration without noticing the duplicate writes.
    """
    writer = FakePresenceStatusWriter()
    bus = EventBus()
    link = SessionPresenceLink(writer=writer)
    link.register(bus)
    link.register(bus)

    await bus.publish(
        SessionAbandoned(
            session_id="s1",
            user_id="u-alice",
            ended_at=_NOW,
        )
    )

    assert writer.calls == [("u-alice", "afk"), ("u-alice", "afk")]
