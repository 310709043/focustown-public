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

import pytest

from app.core.config import get_settings
from app.core.exceptions import AuthError
from app.infrastructure.auth.providers.local_jwt import LocalJWTProvider


@pytest.fixture
def provider(integration_env) -> LocalJWTProvider:
    return LocalJWTProvider(get_settings())


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
