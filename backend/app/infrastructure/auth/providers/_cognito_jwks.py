"""In-process JWKS cache for Cognito access-token verification.

Cognito publishes a small set of rotating RSA public keys at
``https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json``.
Fetching them on every request would add a 100ms+ round-trip; caching them
forever would break verification the moment AWS rotates a key. The cache
here ages out entries after ``ttl_seconds`` (default 1 h) AND eagerly
re-fetches when an unseen ``kid`` shows up — that pair handles both routine
expiry and unscheduled rotations without manual restart.

The store is module-global by design: one process should hold one cache
across all FastAPI workers. State is keyed by ``(region, pool_id, endpoint_override)``
so multi-tenant or LocalStack tests don't collide.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(slots=True)
class _Entry:
    keys: dict[str, dict[str, Any]]  # kid → JWK
    fetched_at: float


_cache: dict[tuple[str, str, str], _Entry] = {}
_lock = asyncio.Lock()


def _jwks_url(region: str, pool_id: str, endpoint_override: str) -> str:
    if endpoint_override:
        # LocalStack / staging-mock support — caller already validated scheme.
        return f"{endpoint_override.rstrip('/')}/{pool_id}/.well-known/jwks.json"
    return f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"


async def _fetch(region: str, pool_id: str, endpoint_override: str) -> _Entry:
    url = _jwks_url(region, pool_id, endpoint_override)
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        payload = resp.json()
    keys = {k["kid"]: k for k in payload.get("keys", []) if "kid" in k}
    return _Entry(keys=keys, fetched_at=time.monotonic())


async def get_jwk(
    *,
    region: str,
    pool_id: str,
    kid: str,
    ttl_seconds: int,
    endpoint_override: str = "",
) -> dict[str, Any] | None:
    """Return the JWK for ``kid`` from cache, refreshing on miss or expiry.

    Returns None when the kid genuinely isn't in the user pool (e.g. token
    forged with a fake kid). Callers should map this to AuthError.
    """

    key = (region, pool_id, endpoint_override)
    now = time.monotonic()

    entry = _cache.get(key)
    if entry and (now - entry.fetched_at) < ttl_seconds and kid in entry.keys:
        return entry.keys[kid]

    async with _lock:
        # Re-check under lock — another coroutine may have refreshed.
        entry = _cache.get(key)
        if entry and (now - entry.fetched_at) < ttl_seconds and kid in entry.keys:
            return entry.keys[kid]
        entry = await _fetch(region, pool_id, endpoint_override)
        _cache[key] = entry
        return entry.keys.get(kid)


def _reset_for_tests() -> None:
    """Test-only helper. Production code never calls this."""
    _cache.clear()
