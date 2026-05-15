"""SimpleOverlapStrategy boundary tests.

Worth testing:
- Empty histories → minimum-floor score (40)
- Full overlap → score saturates near upper bound
- No overlap → no overlap component, base = affinity + 5 (floored at 40)
- Role affinity is bidirectional ((a, b) and (b, a) both score)
- Score never escapes [40, 99]

NOT worth testing:
- Exact integer scores within ±1 — the function uses ``round`` and the
  bonus constants are not load-bearing; pinning the number would couple
  the test to implementation tweaks with no real failure mode.
- The ``reason`` Chinese template string — translation/copy edits are
  not regressions.
"""
from __future__ import annotations

import pytest

from app.domain.services.strategies.simple_overlap import SimpleOverlapStrategy
from tests.unit.fakes import make_user


@pytest.fixture
def strategy() -> SimpleOverlapStrategy:
    return SimpleOverlapStrategy()


@pytest.mark.asyncio
async def test_empty_histories_floor_at_min_score(strategy):
    result = await strategy.score(
        requester=make_user("u1"),
        candidate=make_user("u2"),
        requester_focus_starts=[],
        candidate_focus_starts=[],
    )
    assert result.score == 40


@pytest.mark.asyncio
async def test_full_overlap_high_score(strategy):
    hours = list(range(9, 18))
    result = await strategy.score(
        requester=make_user("u1"),
        candidate=make_user("u2"),
        requester_focus_starts=hours,
        candidate_focus_starts=hours,
    )
    assert result.score >= 80


@pytest.mark.asyncio
async def test_score_never_exceeds_max(strategy):
    hours = list(range(9, 18))
    result = await strategy.score(
        requester=make_user("u1", role_label="UI 設計師"),
        candidate=make_user("u2", role_label="前端工程師"),
        requester_focus_starts=hours,
        candidate_focus_starts=hours,
    )
    assert result.score <= 99


@pytest.mark.asyncio
async def test_role_affinity_is_symmetric(strategy):
    ab = await strategy.score(
        requester=make_user("u1", role_label="UI 設計師"),
        candidate=make_user("u2", role_label="前端工程師"),
        requester_focus_starts=[],
        candidate_focus_starts=[],
    )
    ba = await strategy.score(
        requester=make_user("u1", role_label="前端工程師"),
        candidate=make_user("u2", role_label="UI 設計師"),
        requester_focus_starts=[],
        candidate_focus_starts=[],
    )
    assert ab.score == ba.score


@pytest.mark.asyncio
async def test_role_affinity_increases_score_over_no_affinity(strategy):
    # Add some overlap so both scores climb above the floor (40); only then
    # does the affinity bonus become observable.
    with_affinity = await strategy.score(
        requester=make_user("u1", role_label="UI 設計師"),
        candidate=make_user("u2", role_label="前端工程師"),
        requester_focus_starts=[9],
        candidate_focus_starts=[9, 10],
    )
    without_affinity = await strategy.score(
        requester=make_user("u1", role_label="無關A"),
        candidate=make_user("u2", role_label="無關B"),
        requester_focus_starts=[9],
        candidate_focus_starts=[9, 10],
    )
    assert with_affinity.score > without_affinity.score


@pytest.mark.asyncio
async def test_disjoint_hours_score_lower_than_overlapping(strategy):
    disjoint = await strategy.score(
        requester=make_user("u1"),
        candidate=make_user("u2"),
        requester_focus_starts=[9, 10, 11],
        candidate_focus_starts=[22, 23, 0],
    )
    overlapping = await strategy.score(
        requester=make_user("u1"),
        candidate=make_user("u2"),
        requester_focus_starts=[9, 10, 11],
        candidate_focus_starts=[9, 10, 11],
    )
    assert disjoint.score < overlapping.score
