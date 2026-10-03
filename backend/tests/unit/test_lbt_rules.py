"""LowBatteryTown pure rules: input cleaning, profile parsing, pairing,
opening hours. Logic + boundary + error categories."""
from __future__ import annotations

from datetime import UTC, datetime, time, timedelta

import pytest

from app.domain.models.lbt import LbtProfile, LbtWaiting
from app.domain.services.lbt_rules import (
    NICKNAME_MAX,
    LbtInputError,
    clean_text,
    compatibility,
    is_open,
    parse_open_hours,
    parse_profile,
    pick_partner,
)

T0 = datetime(2026, 10, 3, 13, 0, tzinfo=UTC)  # 21:00 in Asia/Taipei
RELAX = timedelta(seconds=30)


def waiting(gid: str, pref: str = "casual", energy: int = 2, waited: int = 0) -> LbtWaiting:
    return LbtWaiting(
        guest_id=gid,
        profile=LbtProfile(nickname=gid, energy=energy, preference=pref),
        joined_at=T0 - timedelta(seconds=waited),
    )


# ── clean_text ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  hi  ", "hi"),
        ("a\u0000b", "ab"),
        ("a‮b", "ab"),  # bidi override (spoofing)
        ("a​b", "ab"),  # zero-width space
        ("line1\r\nline2", "line1\nline2"),
        ("", ""),
        ("   ", ""),
        (None, ""),
        (42, ""),
    ],
)
def test_clean_text_normalises_input(raw, expected):
    assert clean_text(raw, limit=100) == expected


def test_clean_text_caps_by_code_points_not_utf16():
    assert clean_text("🌙" * 5, limit=3) == "🌙🌙🌙"


# ── parse_profile ───────────────────────────────────────────────────────


def test_parse_profile_accepts_a_valid_profile():
    profile = parse_profile({"nickname": " 小橘 ", "energy": 1, "preference": "listen"})

    assert profile == LbtProfile(nickname="小橘", energy=1, preference="listen")


def test_parse_profile_caps_nickname_length():
    profile = parse_profile({"nickname": "月" * 30, "energy": 2, "preference": "casual"})

    assert profile.nickname == "月" * NICKNAME_MAX


def test_parse_profile_flattens_newlines_in_nickname():
    profile = parse_profile({"nickname": "a\nb", "energy": 2, "preference": "casual"})

    assert profile.nickname == "a b"


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        ({"nickname": "", "energy": 1, "preference": "casual"}, "nickname_required"),
        ({"nickname": "\u0000", "energy": 1, "preference": "casual"}, "nickname_required"),
        ({"energy": 1, "preference": "casual"}, "nickname_required"),
        ({"nickname": "a", "energy": 0, "preference": "casual"}, "invalid_energy"),
        ({"nickname": "a", "energy": 4, "preference": "casual"}, "invalid_energy"),
        ({"nickname": "a", "energy": "2", "preference": "casual"}, "invalid_energy"),
        ({"nickname": "a", "energy": True, "preference": "casual"}, "invalid_energy"),
        ({"nickname": "a", "energy": 2, "preference": "rant"}, "invalid_preference"),
        ({"nickname": "a", "energy": 2}, "invalid_preference"),
    ],
)
def test_parse_profile_rejects_bad_input_with_a_code(raw, code):
    with pytest.raises(LbtInputError) as exc:
        parse_profile(raw)

    assert exc.value.code == code


# ── compatibility / pick_partner ────────────────────────────────────────


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        (("listen", 1), ("story", 2), 4),
        (("listen", 1), ("story", 3), 3),
        (("casual", 2), ("listen", 2), 2),
        (("casual", 1), ("casual", 3), 1),
        (("story", 2), ("story", 2), 2),
        (("listen", 2), ("listen", 2), 1),
        (("listen", 1), ("listen", 3), 0),
    ],
)
def test_compatibility_scores(a, b, expected):
    me = LbtProfile("a", a[1], a[0])
    other = LbtProfile("b", b[1], b[0])

    assert compatibility(me, other) == expected


def test_compatibility_is_symmetric():
    a = LbtProfile("a", 1, "listen")
    b = LbtProfile("b", 3, "story")

    assert compatibility(a, b) == compatibility(b, a)


def test_pick_partner_prefers_the_best_score():
    me = waiting("me", "listen", 1)
    casual = waiting("casual", "casual", 1, waited=10)
    story = waiting("story", "story", 1)

    assert pick_partner(me, [casual, story], now=T0, relax_after=RELAX) is story


def test_pick_partner_breaks_ties_by_longest_wait():
    me = waiting("me")
    newer = waiting("newer", waited=1)
    older = waiting("older", waited=20)

    assert pick_partner(me, [newer, older], now=T0, relax_after=RELAX) is older


def test_pick_partner_skips_a_zero_score_before_relaxing():
    me = waiting("me", "listen", 1)
    other = waiting("other", "listen", 3)

    assert pick_partner(me, [other], now=T0, relax_after=RELAX) is None


def test_pick_partner_accepts_a_zero_score_once_someone_waited_long_enough():
    me = waiting("me", "listen", 1)
    other = waiting("other", "listen", 3, waited=30)

    assert pick_partner(me, [other], now=T0, relax_after=RELAX) is other


def test_pick_partner_never_returns_a_blocked_guest():
    me = waiting("me")
    other = waiting("other", waited=100)

    assert pick_partner(me, [other], now=T0, relax_after=RELAX, blocked={"other"}) is None


def test_pick_partner_never_returns_self():
    me = waiting("me", waited=100)

    assert pick_partner(me, [me], now=T0, relax_after=RELAX) is None


def test_pick_partner_with_nobody_waiting_returns_none():
    assert pick_partner(waiting("me"), [], now=T0, relax_after=RELAX) is None


# ── opening hours ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("spec", "expected"),
    [
        ("", None),
        ("   ", None),
        ("21:00-24:00", (time(21, 0), time(0, 0))),
        ("9:30 - 11:00", (time(9, 30), time(11, 0))),
        ("22:00-02:00", (time(22, 0), time(2, 0))),
    ],
)
def test_parse_open_hours_valid(spec, expected):
    assert parse_open_hours(spec) == expected


@pytest.mark.parametrize(
    "spec", ["21-24", "25:00-26:00", "21:60-22:00", "24:30-01:00", "21:00-21:00", "abc"]
)
def test_parse_open_hours_rejects_invalid(spec):
    with pytest.raises(ValueError, match="open hours"):
        parse_open_hours(spec)


@pytest.mark.parametrize(
    ("local_hhmm", "expected"),
    [
        ((20, 59), False),
        ((21, 0), True),  # start is inclusive
        ((23, 59), True),
        ((0, 0), False),  # 24:00 end is exclusive
    ],
)
def test_is_open_evening_window(local_hhmm, expected):
    hours = parse_open_hours("21:00-24:00")
    # Asia/Taipei is UTC+8 with no DST.
    now = datetime(2026, 10, 3, local_hhmm[0], local_hhmm[1], tzinfo=UTC) - timedelta(hours=8)

    assert is_open(now, hours, "Asia/Taipei") is expected


@pytest.mark.parametrize(
    ("local_hour", "expected"), [(23, True), (1, True), (2, False), (12, False)]
)
def test_is_open_window_crossing_midnight(local_hour, expected):
    hours = parse_open_hours("22:00-02:00")
    now = datetime(2026, 10, 3, local_hour, 0, tzinfo=UTC) - timedelta(hours=8)

    assert is_open(now, hours, "Asia/Taipei") is expected


def test_is_open_without_hours_is_always_open():
    assert is_open(T0, None, "Asia/Taipei") is True
