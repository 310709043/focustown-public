"""Shared fixtures for unit tests.

Every fixture is fresh per test (no module scoping) so cross-test bleed
through fakes/event bus is impossible.
"""
from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest

from app.core.events import EventBus
from tests.unit.fakes import FakeClock, FakeIdGen, FakeNotifier


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock(current=datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC))


@pytest.fixture
def ids() -> FakeIdGen:
    return FakeIdGen()


@pytest.fixture
def events() -> EventBus:
    return EventBus()


@pytest.fixture
def notifier() -> Iterator[FakeNotifier]:
    yield FakeNotifier()
