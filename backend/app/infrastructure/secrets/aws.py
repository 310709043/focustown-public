"""AWS Secrets Manager implementation of ISecretsProvider.

Production flow uses ECS task-definition ``secrets:`` integration to inject
the load-bearing secrets (DB URL, app key) into env vars at task start —
this provider is for the long tail: feature-flag toggles, third-party API
keys looked up at request time, etc. The in-process TTL cache avoids
hammering the Secrets Manager API for hot-path lookups.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.logging import get_logger
from app.infrastructure.secrets.base import ISecretsProvider

log = get_logger(__name__)


class AWSSecretsManagerProvider(ISecretsProvider):
    def __init__(
        self,
        *,
        region: str,
        cache_ttl_seconds: int = 300,
        endpoint_url: str = "",
    ) -> None:
        self._cache_ttl = cache_ttl_seconds
        self._cache: dict[str, tuple[str | None, float]] = {}
        self._lock = asyncio.Lock()

        kwargs: dict[str, Any] = {"region_name": region}
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        self._client = boto3.client("secretsmanager", **kwargs)

    async def get(self, key: str) -> str | None:
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached is not None and (now - cached[1]) < self._cache_ttl:
            return cached[0]

        async with self._lock:
            cached = self._cache.get(key)
            if cached is not None and (now - cached[1]) < self._cache_ttl:
                return cached[0]

            def _fetch() -> str | None:
                try:
                    resp = self._client.get_secret_value(SecretId=key)
                except ClientError as exc:
                    code = exc.response.get("Error", {}).get("Code", "")
                    # Missing secret is a domain-level "not found", not an
                    # error — caller can fall through to a default.
                    if code in {"ResourceNotFoundException", "DecryptionFailure"}:
                        return None
                    raise
                except BotoCoreError:
                    raise
                # Prefer SecretString; SecretBinary is rare and we don't
                # speak it. Return None rather than guess the encoding.
                return resp.get("SecretString")

            value = await asyncio.to_thread(_fetch)
            self._cache[key] = (value, time.monotonic())
            return value

    def _invalidate_for_tests(self) -> None:
        """Test-only helper to clear the in-process cache."""
        self._cache.clear()
