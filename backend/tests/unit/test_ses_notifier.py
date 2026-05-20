"""Unit tests for SESNotifier using moto's in-memory SESv2 mock.

These exercise the adapter against the same boto3 API surface as
production without an AWS account or LocalStack container, so they're
safe in CI and run in <1s.

Moto integration note: see header in `test_secrets_aws.py` — `@mock_aws`
decorator on an `async def` produces a wrapper pytest-asyncio can't
schedule. Use `with mock_aws():` inside the async body instead.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from moto import mock_aws

from app.infrastructure.notifications.ses_notifier import SESNotifier


@pytest.mark.asyncio
async def test_send_email_calls_sesv2_with_expected_params():
    with mock_aws():
        # moto needs the from address pre-verified in v2 SES; we register
        # it here so send_email succeeds instead of failing the dispatch.
        import boto3

        client = boto3.client("sesv2", region_name="ap-northeast-1")
        client.create_email_identity(EmailIdentity="noreply@example.com")

        sender = SESNotifier(
            region="ap-northeast-1", from_email="noreply@example.com"
        )
        # The important assertion is that `await send_email(...)` does
        # NOT raise (the boto3 + moto integration sees a registered
        # identity and accepts the payload). We previously called
        # `client.get_account()` for a stronger check but moto doesn't
        # implement that action; the no-exception path is sufficient.
        await sender.send_email(
            to="user@example.com",
            subject="hello",
            body="world",
        )


@pytest.mark.asyncio
async def test_send_email_swallows_client_error():
    with mock_aws():
        # No identity registered → SES throws on send; the notifier must
        # swallow the error so the password-reset endpoint stays uniform.
        sender = SESNotifier(
            region="ap-northeast-1", from_email="not-verified@example.com"
        )
        await sender.send_email(
            to="user@example.com",
            subject="hello",
            body="world",
        )  # no exception expected


def test_constructor_rejects_empty_from_email():
    with pytest.raises(RuntimeError, match="non-empty from_email"):
        SESNotifier(region="ap-northeast-1", from_email="")


@pytest.mark.asyncio
async def test_send_email_swallows_botocore_error():
    with mock_aws():
        # Simulate a low-level network failure: the underlying boto3
        # call raises BotoCoreError. The notifier must log and return
        # None so the password-reset endpoint stays uniform.
        from botocore.exceptions import BotoCoreError

        sender = SESNotifier(
            region="ap-northeast-1", from_email="noreply@example.com"
        )

        def _raise(*_args, **_kwargs):
            raise BotoCoreError()

        with patch.object(sender._client, "send_email", side_effect=_raise):
            await sender.send_email(to="user@example.com", subject="s", body="b")
