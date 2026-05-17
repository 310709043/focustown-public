"""Production-posture validator coverage.

Mirrors the ``@model_validator(mode='after')`` rules in ``config.py``: each
production-required env var should fail-fast at Settings() instantiation
when missing/weak, and secrets_backend=env should warn (not raise).

Shared fixture ``tests/conftest.py`` already sets DATABASE_URL and a
≥32-char APP_SECRET_KEY, so tests only override the field they target.
"""
from __future__ import annotations

import warnings

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _prod_settings(**overrides: object) -> Settings:
    """Settings instance with the production posture pre-filled.

    Tests override one field at a time to assert the validator fires for
    exactly that field.
    """
    base: dict[str, object] = {
        "app_env": "production",
        "cognito_user_pool_id": "ap-northeast-1_XXXXX",
        "cognito_client_id": "client-id-stub",
        "s3_bucket": "focustown-prod",
        "ses_from_email": "noreply@focustown.app",
        "notifier_backend": "ses",
        "storage_backend": "s3",
        "secrets_backend": "aws",
        "reset_url_base": "https://focustown.app/reset-password",
        **overrides,
    }
    return Settings(**base)  # type: ignore[call-arg]


def test_production_missing_cognito_user_pool_id_raises():
    with pytest.raises(ValidationError, match="COGNITO_USER_POOL_ID"):
        _prod_settings(cognito_user_pool_id="")


def test_production_missing_cognito_client_id_raises():
    with pytest.raises(ValidationError, match="COGNITO_CLIENT_ID"):
        _prod_settings(cognito_client_id="")


def test_production_missing_s3_bucket_raises():
    with pytest.raises(ValidationError, match="S3_BUCKET"):
        _prod_settings(s3_bucket="")


def test_production_missing_ses_from_email_raises():
    # The field-level validator catches this first when notifier_backend=ses,
    # so the error mentions ses_from_email; either way it must reject.
    with pytest.raises(ValidationError, match=r"ses_from_email|SES_FROM_EMAIL"):
        _prod_settings(ses_from_email="")


def test_production_notifier_backend_log_raises():
    with pytest.raises(ValidationError, match="NOTIFIER_BACKEND"):
        _prod_settings(notifier_backend="log")


def test_production_storage_backend_local_raises():
    with pytest.raises(ValidationError, match="STORAGE_BACKEND"):
        _prod_settings(storage_backend="local")


def test_production_secrets_backend_env_warns_but_does_not_raise():
    with pytest.warns(RuntimeWarning, match="SECRETS_BACKEND=env"):
        s = _prod_settings(secrets_backend="env")
    assert s.app_env == "production"


def test_development_defaults_do_not_trigger_production_validator():
    # APP_ENV=test (from shared conftest) leaves the production validator
    # inert; instantiating without any AWS values should succeed silently.
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        s = Settings()  # type: ignore[call-arg]
    assert s.app_env == "test"
