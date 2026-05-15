"""FocusSession state machine + remaining_seconds tests.

Worth testing:
- ``can_transition_to`` is permissive only when status is ACTIVE
- ``remaining_seconds`` clamps to 0 when elapsed >= duration

NOT worth testing:
- The ``default_duration`` dict lookup — covered indirectly by service tests
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus


def _build(*, status: FocusSessionStatus, elapsed: int = 0, duration: int = 600) -> FocusSession:
    return FocusSession(
        id="s",
        user_id="u",
        partner_user_id=None,
        mode=FocusSessionMode.FOCUS,
        duration_seconds=duration,
        elapsed_seconds=elapsed,
        status=status,
        task_label=None,
        started_at=datetime(2026, 1, 1, tzinfo=UTC),
        ended_at=None,
    )


@pytest.mark.parametrize(
    "target",
    [
        FocusSessionStatus.COMPLETED,
        FocusSessionStatus.CANCELLED,
        FocusSessionStatus.ABANDONED,
    ],
)
def test_active_can_transition_to_any_terminal(target: FocusSessionStatus):
    s = _build(status=FocusSessionStatus.ACTIVE)
    assert s.can_transition_to(target) is True


@pytest.mark.parametrize(
    "current",
    [
        FocusSessionStatus.COMPLETED,
        FocusSessionStatus.CANCELLED,
        FocusSessionStatus.ABANDONED,
    ],
)
def test_terminal_cannot_transition(current: FocusSessionStatus):
    s = _build(status=current)
    assert s.can_transition_to(FocusSessionStatus.COMPLETED) is False


def test_remaining_seconds_clamps_to_zero_when_overrun():
    s = _build(status=FocusSessionStatus.ACTIVE, elapsed=900, duration=600)
    assert s.remaining_seconds == 0


def test_remaining_seconds_subtracts_elapsed():
    s = _build(status=FocusSessionStatus.ACTIVE, elapsed=200, duration=600)
    assert s.remaining_seconds == 400
