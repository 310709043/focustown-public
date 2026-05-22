"""Phase 02 cursor-pagination integration coverage.

Exercises the full end-to-end path on real Postgres:
- A repo over-fetches by one and returns rows.
- The router wraps them in ``Page[T]`` with the right ``next_cursor``.
- A second request with that cursor returns the next slice with no
  overlap and no gap.
- A cursor that references a now-deleted row still returns the next
  available rows (the WHERE comparator is strict and forgiving).

We pick notes as the canonical fixture: cheap to insert, fully owned by
the test user, no cross-feature dependencies.
"""
from __future__ import annotations

import base64
import json

import pytest


def _make_cursor_pointing_at_future() -> str:
    """Cursor with a timestamp far in the future — the keyset filter
    ``(created_at, id) < cursor`` should match everything, so the page
    behaves identically to a no-cursor request.
    """
    payload = json.dumps(
        {"ts": "9999-01-01T00:00:00+00:00", "id": "zzz"}, separators=(",", ":")
    )
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


async def _create_notes(client, headers, count: int) -> list[dict]:
    created: list[dict] = []
    for i in range(count):
        r = await client.post(
            "/api/v1/notes",
            json={"title": f"note-{i:02d}", "body": f"b{i}"},
            headers=headers,
        )
        r.raise_for_status()
        created.append(r.json())
    return created


@pytest.mark.asyncio
async def test_list_returns_page_envelope_when_under_limit(client, auth_headers):
    await _create_notes(client, auth_headers, count=3)
    response = await client.get("/api/v1/notes?limit=10", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"items", "next_cursor"}
    assert len(body["items"]) == 3
    assert body["next_cursor"] is None


@pytest.mark.asyncio
async def test_list_yields_cursor_when_overflowed_and_second_page_continues(
    client, auth_headers
):
    created = await _create_notes(client, auth_headers, count=5)
    created_ids = {n["id"] for n in created}

    page1 = await client.get("/api/v1/notes?limit=3", headers=auth_headers)
    body1 = page1.json()
    assert page1.status_code == 200
    assert len(body1["items"]) == 3
    assert body1["next_cursor"] is not None

    page2 = await client.get(
        f"/api/v1/notes?limit=3&cursor={body1['next_cursor']}",
        headers=auth_headers,
    )
    body2 = page2.json()
    assert page2.status_code == 200
    # Remaining 2 rows; no next_cursor because the second page is short.
    assert len(body2["items"]) == 2
    assert body2["next_cursor"] is None
    # No overlap; together both pages cover the full input set.
    page1_ids = {n["id"] for n in body1["items"]}
    page2_ids = {n["id"] for n in body2["items"]}
    assert page1_ids.isdisjoint(page2_ids)
    assert page1_ids | page2_ids == created_ids


@pytest.mark.asyncio
async def test_invalid_cursor_returns_422(client, auth_headers):
    response = await client.get(
        "/api/v1/notes?cursor=not-a-valid-cursor!!!", headers=auth_headers
    )
    # InvalidCursorError subclasses ValidationError → 422 via the
    # project-wide handler.
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_stale_cursor_for_deleted_row_returns_remaining_rows(
    client, auth_headers
):
    """If a client paginates, the row at the cursor's tip is deleted, and
    they then request the next page, the WHERE comparator is strict so
    rows older than the deleted row's timestamp still come back.
    """
    created = await _create_notes(client, auth_headers, count=4)
    # First page picks the two newest.
    page1 = await client.get("/api/v1/notes?limit=2", headers=auth_headers)
    body1 = page1.json()
    assert len(body1["items"]) == 2
    cursor = body1["next_cursor"]
    assert cursor is not None
    # Delete the row whose (created_at, id) is the cursor — the 2nd
    # newest, which is the LAST row in the first page.
    deleted_id = body1["items"][-1]["id"]
    del_resp = await client.delete(
        f"/api/v1/notes/{deleted_id}", headers=auth_headers
    )
    assert del_resp.status_code == 204
    # Now fetch the next page using the cursor pointing at the deleted
    # row. We should still get the remaining 2 (oldest) notes back,
    # not 500 or 404.
    page2 = await client.get(
        f"/api/v1/notes?limit=10&cursor={cursor}", headers=auth_headers
    )
    body2 = page2.json()
    assert page2.status_code == 200
    remaining_expected = {n["id"] for n in created} - {deleted_id, body1["items"][0]["id"]}
    assert {n["id"] for n in body2["items"]} == remaining_expected


@pytest.mark.asyncio
async def test_far_future_cursor_returns_full_first_page(client, auth_headers):
    """A cursor with a ts past the newest row passes the keyset filter
    for every row; equivalent to no cursor at all.
    """
    await _create_notes(client, auth_headers, count=3)
    cursor = _make_cursor_pointing_at_future()
    response = await client.get(
        f"/api/v1/notes?limit=10&cursor={cursor}", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 3
    assert body["next_cursor"] is None


@pytest.mark.asyncio
async def test_export_streams_ndjson_per_row(client, auth_headers):
    """Smoke test for the NDJSON export endpoint — each row arrives on
    its own line, the media type matches ``application/x-ndjson``.
    """
    await _create_notes(client, auth_headers, count=3)
    response = await client.get("/api/v1/notes/export", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    lines = [
        ln for ln in response.text.splitlines() if ln.strip()
    ]
    assert len(lines) == 3
    # Each line must independently parse as a JSON object.
    rows = [json.loads(ln) for ln in lines]
    assert all("title" in r and "body" in r for r in rows)
