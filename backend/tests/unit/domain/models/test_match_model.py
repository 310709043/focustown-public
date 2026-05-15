"""Match status enum invariants.

Worth testing:
- All four expected statuses exist and round-trip from value strings

NOT worth testing:
- Dataclass equality — provided by ``@dataclass``
- Construction with arbitrary statuses — Python doesn't enforce StrEnum at
  construction; we trust upstream callers (the SQL layer + service-level
  state machine)
"""
from __future__ import annotations

import pytest

from app.domain.models import MatchStatus


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("PENDING", "pending"),
        ("ACCEPTED", "accepted"),
        ("SKIPPED", "skipped"),
        ("EXPIRED", "expired"),
    ],
)
def test_match_status_value_round_trip(name: str, value: str):
    assert MatchStatus(value).name == name
