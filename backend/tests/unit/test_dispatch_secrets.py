"""Pin the secrets-provider dispatch in secrets/factory.py.

Same shape as test_dispatch_notifier: flipping SECRETS_BACKEND swaps the
concrete adapter; no consumer changes.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.infrastructure.secrets.env import EnvSecretsProvider
from app.infrastructure.secrets.factory import make_secrets_provider


def _settings(**overrides: object) -> Settings:
    return Settings(**overrides)  # type: ignore[call-arg]


def test_make_secrets_provider_env_returns_env_provider():
    s = _settings(secrets_backend="env")
    assert isinstance(make_secrets_provider(s), EnvSecretsProvider)


def test_make_secrets_provider_aws_returns_aws_provider():
    s = _settings(secrets_backend="aws", aws_region="ap-northeast-1")
    provider = make_secrets_provider(s)
    from app.infrastructure.secrets.aws import AWSSecretsManagerProvider

    assert isinstance(provider, AWSSecretsManagerProvider)


def test_make_secrets_provider_unknown_backend_raises():
    s = _settings(secrets_backend="env")
    object.__setattr__(s, "secrets_backend", "vault")  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="unsupported secrets_backend"):
        make_secrets_provider(s)
