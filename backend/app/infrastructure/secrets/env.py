from __future__ import annotations

import os

from app.infrastructure.secrets.base import ISecretsProvider


class EnvSecretsProvider(ISecretsProvider):
    """Reads secrets from environment variables.

    v2 swap: AWSSecretsManagerProvider that fetches from Secrets Manager / SSM
    Parameter Store, with a short in-process TTL cache.
    """

    async def get(self, key: str) -> str | None:
        return os.environ.get(key)
