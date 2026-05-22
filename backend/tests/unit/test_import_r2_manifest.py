"""Unit tests for the pure helpers in
``app/infrastructure/db/seed/r2_helpers.py``.

DB-touching paths (insert / reset) ride the existing track repo's
integration coverage; here we lock down the filename → (title, mood)
derivation since the manifest could feed in any operator-chosen
filenames and we don't want silent regressions.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from app.infrastructure.db.seed import r2_helpers as _mod
from app.infrastructure.db.seed.track_catalog import deterministic_track_id

# The operator-driven script still lives under `backend/scripts/` and isn't
# a regular package — load it by path so the script-only helpers
# (e.g. ``mp3_duration_ms``) remain covered.
_SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))
_SCRIPT = _SCRIPTS_DIR / "import-r2-manifest.py"
_spec = importlib.util.spec_from_file_location("import_r2_manifest", _SCRIPT)
assert _spec and _spec.loader
_script_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_script_mod)


@pytest.mark.parametrize(
    "filename, expected",
    [
        ("Afternoon_Curtains.mp3", "Afternoon Curtains"),
        ("Afternoon_Curtains (1).mp3", "Afternoon Curtains"),  # copy-marker stripped
        ("midnight-at-the-overpass.mp3", "Midnight At The Overpass"),
        ("After_the_Last_Call.mp3", "After The Last Call"),
        ("UPPER.mp3", "Upper"),
        ("no-extension", "No Extension"),
        ("Multiple   Spaces.mp3", "Multiple   Spaces"),  # don't collapse non-separator whitespace
    ],
)
def test_derive_title(filename, expected):
    assert _mod.derive_title(filename) == expected


def test_derive_title_empty_falls_back_to_filename():
    # Defensive: pathological all-separator stems shouldn't return empty.
    assert _mod.derive_title("___.mp3") == "___.mp3"


def test_derive_mood_uses_override_when_present():
    mood_map = {"midnight-at-the-overpass.mp3": {"mood": "jazz"}}
    assert _mod.derive_mood("midnight-at-the-overpass.mp3", mood_map) == "jazz"


def test_derive_mood_falls_back_to_default_map_when_arg_omitted():
    # Default MOOD_MAP_DEFAULT pins "midnight-at-the-overpass.mp3" → jazz.
    assert _mod.derive_mood("midnight-at-the-overpass.mp3") == "jazz"


def test_derive_mood_defaults_to_lofi_for_unknown_filename():
    assert _mod.derive_mood("anything-else.mp3", {}) == "lofi"


def test_title_override_returns_explicit_value_when_present():
    mood_map = {"cold-ceramics.mp3": {"title": "Cold Ceramics", "mood": "ambient"}}
    assert _mod.title_override("cold-ceramics.mp3", mood_map) == "Cold Ceramics"


def test_title_override_returns_none_when_filename_unmapped():
    assert _mod.title_override("anything-else.mp3", {}) is None


def test_default_mood_map_covers_all_5_seed_tracks():
    # The 5 originals must keep their curated titles+moods so the dev
    # seed catalog stays human-readable across re-imports.
    assert set(_mod.MOOD_MAP_DEFAULT.keys()) == {
        "cold-ceramics.mp3",
        "sunlight-on-the-floor.mp3",
        "cold-windowpane.mp3",
        "midnight-at-the-overpass.mp3",
        "sunday-window.mp3",
    }


def test_mp3_duration_returns_none_for_missing_file(tmp_path):
    fake = tmp_path / "does-not-exist.mp3"
    assert _script_mod.mp3_duration_ms(fake) is None


def test_mp3_duration_returns_none_for_garbage_file(tmp_path):
    fake = tmp_path / "garbage.mp3"
    fake.write_bytes(b"not actually an MP3")
    # mutagen will fail to parse — best-effort returns None
    assert _script_mod.mp3_duration_ms(fake) is None


def test_deterministic_track_id_is_pure():
    # Same file_key → identical UUID across calls. This is the property
    # that keeps the StationCursor (Redis) and the tracks table (Postgres)
    # in sync across DB resets — a random UUID4 here is the root cause
    # of the play-token 404 storm.
    assert deterministic_track_id("tracks/foo.mp3") == deterministic_track_id(
        "tracks/foo.mp3"
    )


def test_deterministic_track_id_distinguishes_distinct_keys():
    assert deterministic_track_id("tracks/foo.mp3") != deterministic_track_id(
        "tracks/bar.mp3"
    )


def test_deterministic_track_id_is_a_valid_uuid_string():
    import uuid as _uuid

    out = deterministic_track_id("tracks/anything.mp3")
    # Must round-trip through ``uuid.UUID`` so SQLAlchemy / Postgres
    # accept it as a VARCHAR(36) primary key.
    assert str(_uuid.UUID(out)) == out
