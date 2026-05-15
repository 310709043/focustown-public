"""/matches/auto integration tests.

Covers the real-first-then-bot fallback policy and the auto-accept that
fires when the chosen candidate is a bot. The router contract:

- 201 + status=accepted when fallback to bot (server-side accept)
- 201 + status=pending when a real human is matched (they must accept)
- 409 ``no_match_candidate_available`` when neither pool has candidates
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.core.security import hash_password
from app.infrastructure.db.models.user import UserORM


async def _add_bot(db_session, *, key: str, name: str) -> str:
    bot = UserORM(
        id=f"bot-{key}",
        email=f"bot-{key}@bots.focustown.local",
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
async def test_auto_match_falls_back_to_bot_and_auto_accepts(
    client, auth_headers, db_session
):
    await _add_bot(db_session, key="luna", name="Luna")
    await _add_bot(db_session, key="kai", name="Kai")
    await db_session.flush()

    response = await client.post("/api/v1/matches/auto", headers=auth_headers)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "accepted"
    assert body["candidate_id"] in {"bot-luna", "bot-kai"}
    assert body["candidate_character_key"] in {"luna", "kai"}


@pytest.mark.asyncio
async def test_auto_match_returns_conflict_when_no_candidates(
    client, auth_headers
):
    response = await client.post("/api/v1/matches/auto", headers=auth_headers)

    assert response.status_code == 409
    assert response.json()["error"]["message"] == "no_match_candidate_available"


@pytest.mark.asyncio
async def test_auto_match_prefers_real_human_when_on_street(
    client, auth_headers, authed_user, db_session, flushed_redis
):
    """Alice (authed_user) has Bob on the street + a bot pool. /matches/auto
    must choose Bob (PENDING) over any bot, because the policy is
    real-first-then-bot."""
    await _add_bot(db_session, key="luna", name="Luna")
    await db_session.flush()

    # Create Bob via the public signup endpoint so he exists in DB.
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
    bob_id = bob_signup.json()["user"]["id"]

    # Manually put Bob on the street in Redis (he isn't WS-connected here).
    from app.core.clock import SystemClock
    from app.infrastructure.presence.redis_tracker import RedisPresenceTracker
    tracker = RedisPresenceTracker(flushed_redis, SystemClock())
    await tracker.online(bob_id, state="on_street", status="focus")

    response = await client.post("/api/v1/matches/auto", headers=auth_headers)

    assert response.status_code == 201
    body = response.json()
    assert body["candidate_id"] == bob_id
    assert body["status"] == "pending"  # Bob must accept
