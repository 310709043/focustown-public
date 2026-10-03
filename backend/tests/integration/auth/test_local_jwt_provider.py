"""LocalJWTProvider round-trip against real env settings.

Worth testing:
- issue → verify gives back the same subject
- refresh token cannot be used as access token (type guard)
- access token cannot be used as refresh token

NOT worth testing:
- The exact JWT payload format — that's python-jose's contract, not ours
- bcrypt hashing — that's already covered by the auth router signup test
"""
from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio

from app.core.config import get_settings
from app.core.exceptions import AuthError
from app.infrastructure.auth.providers.local_jwt import LocalJWTProvider


@pytest_asyncio.fixture
async def provider(integration_env) -> AsyncIterator[LocalJWTProvider]:
    # refresh() consults the revocation key in Redis; bind a client to this
    # test's event loop like the ``app`` fixture does.
    import app.infrastructure.cache.redis_client as redis_client_mod
    from app.infrastructure.cache.redis_client import close_redis, init_redis

    redis_client_mod._client = None
    await init_redis(integration_env["REDIS_URL"])
    yield LocalJWTProvider(get_settings())
    await close_redis()


@pytest.mark.asyncio
async def test_issued_access_token_verifies_back_to_subject(provider):
    pair = await provider.issue_tokens(user_id="u-jwt-1")
    principal = await provider.verify_access_token(pair.access_token)
    assert principal.user_id == "u-jwt-1"


@pytest.mark.asyncio
async def test_refresh_token_rejected_as_access_token(provider):
    pair = await provider.issue_tokens(user_id="u-jwt-2")
    with pytest.raises(AuthError):
        await provider.verify_access_token(pair.refresh_token)


@pytest.mark.asyncio
async def test_access_token_rejected_for_refresh(provider):
    pair = await provider.issue_tokens(user_id="u-jwt-3")
    with pytest.raises(AuthError):
        await provider.refresh(pair.access_token)


@pytest.mark.asyncio
async def test_refresh_returns_new_pair(provider):
    pair = await provider.issue_tokens(user_id="u-jwt-4")
    refreshed = await provider.refresh(pair.refresh_token)
    assert refreshed.access_token
    assert refreshed.refresh_token


@pytest.mark.asyncio
async def test_refresh_accepts_token_issued_right_after_revoke(provider):
    # Sign-in revokes older refresh tokens, then issues a pair in the same
    # second; that fresh pair must still refresh.
    await provider.revoke_all_refresh_tokens("u-jwt-5")
    pair = await provider.issue_tokens(user_id="u-jwt-5")
    assert (await provider.refresh(pair.refresh_token)).access_token
