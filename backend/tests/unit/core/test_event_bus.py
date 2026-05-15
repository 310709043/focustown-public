"""EventBus dispatch behaviour.

Worth testing:
- subscribe + publish fans out to every handler for the matching type
- A failing handler does NOT abort sibling handlers (this is the core
  guarantee — without it a flaky achievement handler would block coin
  credit on session completion)
- Events with no subscribers are silently ignored

NOT worth testing:
- The handler registry shape — implementation detail
- The structlog log call itself — exercising the swallow path is the
  signal we care about
"""
from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.core.events import EventBus


@dataclass
class EventA:
    payload: str


@dataclass
class EventB:
    payload: str


@pytest.mark.asyncio
async def test_publish_fans_out_to_all_subscribers():
    bus = EventBus()
    seen: list[str] = []

    async def h1(e: EventA) -> None:
        seen.append(f"h1:{e.payload}")

    async def h2(e: EventA) -> None:
        seen.append(f"h2:{e.payload}")

    bus.subscribe(EventA, h1)
    bus.subscribe(EventA, h2)

    await bus.publish(EventA(payload="x"))

    assert seen == ["h1:x", "h2:x"]


@pytest.mark.asyncio
async def test_publish_does_not_invoke_other_event_handlers():
    bus = EventBus()
    seen: list[str] = []

    async def handler_a(e: EventA) -> None:
        seen.append(f"a:{e.payload}")

    async def handler_b(e: EventB) -> None:
        seen.append(f"b:{e.payload}")

    bus.subscribe(EventA, handler_a)
    bus.subscribe(EventB, handler_b)

    await bus.publish(EventA(payload="x"))

    assert seen == ["a:x"]


@pytest.mark.asyncio
async def test_failing_subscriber_does_not_break_siblings():
    bus = EventBus()
    later_calls: list[str] = []

    async def boom(e: EventA) -> None:
        raise RuntimeError("subscriber blew up")

    async def survivor(e: EventA) -> None:
        later_calls.append(e.payload)

    bus.subscribe(EventA, boom)
    bus.subscribe(EventA, survivor)

    await bus.publish(EventA(payload="x"))

    assert later_calls == ["x"]


@pytest.mark.asyncio
async def test_publish_event_without_subscribers_is_noop():
    bus = EventBus()
    await bus.publish(EventA(payload="x"))  # must not raise
