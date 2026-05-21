"""Pure helpers shared between the operator-driven importer
(`scripts/import-r2-manifest.py`), the dev-seed script
(`scripts/seed-dev-data.py`), and the container-startup auto-seed
hook (`app/main.py:lifespan`).

No DB / IO / async — keep this module trivially testable.

Lived in `scripts/_r2_helpers.py` historically; moved here so
`app.main` can import without sys.path gymnastics.
"""
from __future__ import annotations

import re

SEED_SYSTEM_USER_EMAIL = "seed-system@lowbatterytown.local"
DEFAULT_MOOD = "lofi"

# Curated overrides for the 5 original seed tracks so their human titles
# read naturally ("Cold Ceramics" not "Cold-Ceramics") and their mood is
# stable across re-imports. Anything not listed falls back to the slug-
# derived title and DEFAULT_MOOD.
MOOD_MAP_DEFAULT: dict[str, dict[str, str]] = {
    "cold-ceramics.mp3": {"title": "Cold Ceramics", "mood": "ambient"},
    "sunlight-on-the-floor.mp3": {"title": "Sunlight on the Floor", "mood": "lofi"},
    "cold-windowpane.mp3": {"title": "Cold Windowpane", "mood": "ambient"},
    "midnight-at-the-overpass.mp3": {"title": "Midnight at the Overpass", "mood": "jazz"},
    "sunday-window.mp3": {"title": "Sunday Window", "mood": "lofi"},
}

# Source filenames sometimes include trailing copy markers like
# "Afternoon_Curtains (1).mp3" (two browser-downloaded copies of the
# same track). Strip them when deriving the human title so duplicates
# collide as expected — the DB unique constraint is on file_key, not
# title, so title duplicates are tolerated.
_COPY_SUFFIX = re.compile(r"\s*\(\s*\d+\s*\)\s*$")
_SEP = re.compile(r"[_\-]+")


def derive_title(filename: str) -> str:
    stem = filename[:-4] if filename.lower().endswith(".mp3") else filename
    stem = _SEP.sub(" ", stem)
    stem = _COPY_SUFFIX.sub("", stem)
    return stem.strip().title() or filename


def derive_mood(filename: str, mood_map: dict[str, dict[str, str]] | None = None) -> str:
    m = mood_map if mood_map is not None else MOOD_MAP_DEFAULT
    return m.get(filename, {}).get("mood", DEFAULT_MOOD)


def title_override(
    filename: str, mood_map: dict[str, dict[str, str]] | None = None
) -> str | None:
    m = mood_map if mood_map is not None else MOOD_MAP_DEFAULT
    return m.get(filename, {}).get("title")
