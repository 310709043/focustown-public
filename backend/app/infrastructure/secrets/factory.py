"""Secrets provider factory — single dispatch point for ISecretsProvider.

Same shape as ``storage/factory.py`` and ``notifications/factory.py``:
``settings.secrets_backend`` selects between the env-var-backed default
and the AWS Secrets Manager adapter, and new backends slot in here
without changing any consumer.
"""

from __future__ import annotations

from app.core.config import Settings
from app.infrastructure.secrets.base import ISecretsProvider
from app.infrastructure.secrets.env import EnvSecretsProvider


def make_secrets_provider(settings: Settings) -> ISecretsProvider:
    backend = settings.secrets_backend
    if backend == "env":
        return EnvSecretsProvider()
    if backend == "aws":
        # Lazy import so boto3's Secrets Manager client is only built when
        # an operator explicitly opted in via SECRETS_BACKEND=aws.
        from app.infrastructure.secrets.aws import AWSSecretsManagerProvider

        return AWSSecretsManagerProvider(
            region=settings.aws_region,
            cache_ttl_seconds=settings.secrets_cache_ttl_seconds,
            endpoint_url=settings.secrets_endpoint_url,
        )
    raise RuntimeError(f"unsupported secrets_backend: {backend}")
