"""LbtConversation behaviour: partner lookup, remaining time, mutual
extension, serialisation round-trip."""
from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.models.lbt import LbtConversation, LbtProfile

T0 = datetime(2026, 10, 3, 13, 0, tzinfo=UTC)
WINDOW = timedelta(seconds=420)


@pytest.fixture
def conversation() -> LbtConversation:
    return LbtConversation(
        id="c1",
        guest_a="g_a",
        guest_b="g_b",
        profile_a=LbtProfile("A", 1, "listen"),
        profile_b=LbtProfile("B", 3, "story"),
        started_at=T0,
        ends_at=T0 + WINDOW,
    )


def test_partner_of_each_side(conversation):
    assert (conversation.partner_of("g_a"), conversation.partner_of("g_b")) == ("g_b", "g_a")


def test_partner_of_a_stranger_raises(conversation):
    with pytest.raises(ValueError, match="not part"):
        conversation.partner_of("g_x")


def test_profile_of_a_stranger_raises(conversation):
    with pytest.raises(ValueError, match="not part"):
        conversation.profile_of("g_x")


@pytest.mark.parametrize(("elapsed", "expected"), [(0, 420), (419, 1), (420, 0), (500, 0)])
def test_remaining_seconds(conversation, elapsed, expected):
    assert conversation.remaining_seconds(T0 + timedelta(seconds=elapsed)) == expected


@pytest.mark.parametrize(("after_end", "expected"), [(59, False), (60, True), (61, True)])
def test_is_past_grace(conversation, after_end, expected):
    now = conversation.ends_at + timedelta(seconds=after_end)

    assert conversation.is_past_grace(now, timedelta(seconds=60)) is expected


def test_one_request_records_it_without_extending(conversation):
    updated, extended = conversation.request_extend("g_a", T0, WINDOW)

    assert (extended, updated.extend_requests, updated.ends_at) == (
        False,
        frozenset({"g_a"}),
        conversation.ends_at,
    )


def test_asking_twice_from_the_same_side_still_does_not_extend(conversation):
    once, _ = conversation.request_extend("g_a", T0, WINDOW)

    _, extended = once.request_extend("g_a", T0, WINDOW)

    assert extended is False


def test_both_requests_extend_and_reset_requests(conversation):
    once, _ = conversation.request_extend("g_a", T0, WINDOW)

    updated, extended = once.request_extend("g_b", T0, WINDOW)

    assert (extended, updated.ends_at, updated.extend_requests, updated.extensions) == (
        True,
        conversation.ends_at + WINDOW,
        frozenset(),
        1,
    )


def test_agreeing_during_grace_gives_a_full_window_from_now(conversation):
    late = conversation.ends_at + timedelta(seconds=30)
    once, _ = conversation.request_extend("g_a", late, WINDOW)

    updated, _ = once.request_extend("g_b", late, WINDOW)

    assert updated.ends_at == late + WINDOW


def test_request_from_a_stranger_raises(conversation):
    with pytest.raises(ValueError, match="not part"):
        conversation.request_extend("g_x", T0, WINDOW)


def test_request_extend_does_not_mutate_the_original(conversation):
    conversation.request_extend("g_a", T0, WINDOW)

    assert conversation.extend_requests == frozenset()


def test_dict_round_trip(conversation):
    original = replace(conversation, extend_requests=frozenset({"g_b"}), extensions=2)

    assert LbtConversation.from_dict(original.to_dict()) == original
