"""Unit tests for AWSSecretsManagerProvider via moto.

Tests cover the cache contract (one upstream call per TTL window) and the
ResourceNotFoundException → None mapping so callers can fall through.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from moto import mock_aws

from app.infrastructure.secrets.aws import AWSSecretsManagerProvider


@pytest.fixture
def aws_region() -> str:
    return "ap-northeast-1"


@mock_aws
async def test_get_returns_stored_secret_string(aws_region):
    import boto3

    sm = boto3.client("secretsmanager", region_name=aws_region)
    sm.create_secret(Name="focustown/dev/api-key", SecretString="abc123")

    provider = AWSSecretsManagerProvider(region=aws_region, cache_ttl_seconds=60)
    value = await provider.get("focustown/dev/api-key")
    assert value == "abc123"


@mock_aws
async def test_get_returns_none_when_secret_missing(aws_region):
    provider = AWSSecretsManagerProvider(region=aws_region, cache_ttl_seconds=60)
    value = await provider.get("focustown/dev/nope")
    assert value is None


@mock_aws
async def test_get_uses_cache_within_ttl(aws_region):
    import boto3

    sm = boto3.client("secretsmanager", region_name=aws_region)
    sm.create_secret(Name="focustown/dev/api-key", SecretString="abc123")

    provider = AWSSecretsManagerProvider(region=aws_region, cache_ttl_seconds=60)
    # Prime cache
    await provider.get("focustown/dev/api-key")

    with patch.object(
        provider._client, "get_secret_value", wraps=provider._client.get_secret_value
    ) as spy:
        # Second call within TTL must not hit boto3 again.
        v = await provider.get("focustown/dev/api-key")
        assert v == "abc123"
        assert spy.call_count == 0


@mock_aws
async def test_get_refreshes_after_invalidation(aws_region):
    import boto3

    sm = boto3.client("secretsmanager", region_name=aws_region)
    sm.create_secret(Name="focustown/dev/api-key", SecretString="abc123")

    provider = AWSSecretsManagerProvider(region=aws_region, cache_ttl_seconds=60)
    await provider.get("focustown/dev/api-key")

    # Rotate the secret value and clear the local cache; next read should
    # see the new value because boto3 is hit again.
    sm.put_secret_value(SecretId="focustown/dev/api-key", SecretString="rotated")
    provider._invalidate_for_tests()
    assert await provider.get("focustown/dev/api-key") == "rotated"
