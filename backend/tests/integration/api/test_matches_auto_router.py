"""/matches/auto integration tests — waiting-pool contract.

The endpoint now responds with one of:
  - 201 + {status: "matched", via, match: {...}}   real partner was already
                                                   waiting (or matched on
                                                   immediate-pair).
  - 202 + {status: "waiting", enqueued_at_ms,
           bot_fallback_at_ms}                     requester placed in the
                                                   pool; bot-fallback will
                                                   fire from the worker sweep.

Bot fallback is no longer immediate - the user is enqueued and a periodic
sweep (worker process, every 3s) escalates to bot after a per-user random
25-30s deadline. Integration tests don't run the worker, so the
post-enqueue HTTP response stops at "waiting"; the sweep itself is
covered by ``test_matching_queue_service.py`` (unit-level) and
``test_redis_queue.py`` (Redis behaviour).
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.security import hash_password
from app.infrastructure.db.models.user import UserORM


async def _add_bot(db_session, *, key: str, name: str) -> str:
    bot = UserORM(
        id=f"bot-{key}",
        email=f"bot-{key}@bots.lowbatterytown.local",
        password_hash=hash_password("never-login"),
        display_name=name,
        character_key=key,
        role_label="bot",
        is_active=True,
        is_bot=True,
        terms_accepted_at=datetime.now(UTC),
        terms_version="v1",
    )
    db_session.add(bot)
    await db_session.flush()
    return bot.id


@pytest.mark.asyncio
async def test_auto_match_enqueues_when_no_real_partner(
    client, auth_headers, db_session
):
    """No real users waiting → requester is enqueued (202). Bots in the
    catalog don't matter here — bot fallback is deferred to the sweep."""
    await _add_bot(db_session, key="luna", name="Luna")
    await db_session.flush()

    response = await client.post("/api/v1/matches/auto", headers=auth_headers)

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "waiting"
    assert isinstance(body["enqueued_at_ms"], int)
    assert isinstance(body["bot_fallback_at_ms"], int)
    # The fallback deadline is 25-30s after the enqueue timestamp.
    delta = body["bot_fallback_at_ms"] - body["enqueued_at_ms"]
    assert 25_000 <= delta <= 30_000


@pytest.mark.asyncio
async def test_auto_match_double_call_is_idempotent(
    client, auth_headers
):
    first = await client.post("/api/v1/matches/auto", headers=auth_headers)
    second = await client.post("/api/v1/matches/auto", headers=auth_headers)

    assert first.status_code == 202
    assert second.status_code == 202
    # Same enqueue timestamp + same deadline = same waiter row
    assert first.json()["enqueued_at_ms"] == second.json()["enqueued_at_ms"]
    assert first.json()["bot_fallback_at_ms"] == second.json()["bot_fallback_at_ms"]


@pytest.mark.asyncio
async def test_auto_match_pairs_immediately_with_existing_real_waiter(
    client, auth_headers, authed_user, db_session, flushed_redis
):
    """Bob is already waiting in the pool. Alice (authed_user) requests
    matching → server pairs them immediately and returns 201 matched."""
    from app.core.config import get_settings
    bob_signup = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "bob@example.com",
            "password": "Sup3rSecret-bbb",
            "display_name": "Bob",
            "terms_accepted": True,
            "terms_version": get_settings().terms_current_version,
            "marketing_opt_in": False,
        },
    )
    bob_token = bob_signup.json()["tokens"]["access_token"]
    bob_id = bob_signup.json()["user"]["id"]

    # Bob enqueues first
    bob_resp = await client.post(
        "/api/v1/matches/auto",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert bob_resp.status_code == 202

    # Alice enqueues — should pair with Bob immediately
    alice_resp = await client.post("/api/v1/matches/auto", headers=auth_headers)

    assert alice_resp.status_code == 201
    body = alice_resp.json()
    assert body["status"] == "matched"
    assert body["via"] == "waiting_pool"
    match = body["match"]
    # Real-real pair stays PENDING — both sides must explicitly accept.
    assert match["status"] == "pending"
    # Either side could be requester depending on who was enqueued first;
    # the important invariant is that both Alice and Bob appear.
    assert {match["requester_id"], match["candidate_id"]} == {
        authed_user["id"],
        bob_id,
    }


@pytest.mark.asyncio
async def test_cancel_queue_removes_waiter(
    client, auth_headers, flushed_redis
):
    await client.post("/api/v1/matches/auto", headers=auth_headers)

    cancel = await client.delete("/api/v1/matches/queue", headers=auth_headers)
    status_after = await client.get(
        "/api/v1/matches/queue/me", headers=auth_headers
    )

    assert cancel.status_code == 204
    assert status_after.status_code == 404


@pytest.mark.asyncio
async def test_queue_me_returns_404_when_not_waiting(client, auth_headers):
    response = await client.get("/api/v1/matches/queue/me", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_queue_me_returns_waiting_state(client, auth_headers):
    enqueue_resp = await client.post(
        "/api/v1/matches/auto", headers=auth_headers
    )
    status_resp = await client.get(
        "/api/v1/matches/queue/me", headers=auth_headers
    )

    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "waiting"
    assert (
        status_resp.json()["enqueued_at_ms"]
        == enqueue_resp.json()["enqueued_at_ms"]
    )
