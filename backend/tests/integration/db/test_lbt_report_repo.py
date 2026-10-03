"""SqlLbtReportRepo against Postgres: UTF-8 transcripts round-trip and the
retention purge removes only reports older than the cutoff."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.domain.repositories.lbt import LbtReportRecord
from app.infrastructure.db.repositories.lbt_report_repo import SqlLbtReportRepo

pytestmark = pytest.mark.asyncio

NOW = datetime(2026, 10, 3, 13, 0, tzinfo=UTC)


def report(rid: str, age_days: int) -> LbtReportRecord:
    return LbtReportRecord(
        id=rid,
        conversation_id=f"c-{rid}",
        reporter_guest_id="g_a",
        reported_guest_id="g_b",
        reason="harassment",
        note="不舒服",
        transcript=[{"from": "g_b", "text": "晚安", "at": NOW.isoformat()}],
        reporter_profile={"nickname": "小橘", "energy": 1, "preference": "listen"},
        reported_profile={"nickname": "阿樹", "energy": 2, "preference": "story"},
        status="open",
        created_at=NOW - timedelta(days=age_days),
    )


async def test_purge_removes_only_reports_past_the_cutoff(db_session):
    repo = SqlLbtReportRepo(db_session)
    for rid, age in (("old", 200), ("edge", 179), ("new", 1)):
        await repo.create(report(rid, age))

    removed = await repo.delete_older_than(NOW - timedelta(days=180))

    remaining = await repo.list_recent(status=None, limit=10)
    assert (removed, sorted(r.id for r in remaining)) == (1, ["edge", "new"])


async def test_transcript_text_round_trips(db_session):
    repo = SqlLbtReportRepo(db_session)
    await repo.create(report("r1", 0))

    (stored,) = await repo.list_recent(status=None, limit=1)

    assert (stored.transcript[0]["text"], stored.note) == ("晚安", "不舒服")
