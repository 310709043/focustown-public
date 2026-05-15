"""Room module-level constant invariants.

Worth testing:
- Theme whitelist is the documented frozen set
- Default theme is a member of the whitelist (otherwise lazy-create
  would explode at boot)
- Name length limit is the documented constant

NOT worth testing:
- Room dataclass field assignment — trivial
- Validation logic — that lives in RoomService (already covered by
  test_room_service.py)
"""
from __future__ import annotations

from app.domain.models.room import (
    ALLOWED_THEMES,
    DEFAULT_THEME,
    MAX_ROOM_NAME_LEN,
)


def test_default_theme_is_in_whitelist():
    assert DEFAULT_THEME in ALLOWED_THEMES


def test_whitelist_contains_documented_themes():
    assert ALLOWED_THEMES == frozenset(
        {"dawn", "day", "dusk", "night", "rain", "snow", "storm"}
    )


def test_max_room_name_len_is_64():
    assert MAX_ROOM_NAME_LEN == 64
