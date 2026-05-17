"""Production-posture validator coverage.

Mirrors the ``@model_validator(mode='after')`` rules in ``config.py``: each
production-required env var should fail-fast at Settings() instantiation
when missing/weak, and secrets_backend=env should warn (not raise).

The validator is **conditional** on the chosen backend — `AUTH_PROVIDER=cognito`
enforces COGNITO_* vars, `STORAGE_BACKEND=s3` enforces S3_BUCKET, and
`STORAGE_BACKEND=local` is acceptable in production (single-VM deploys with
bind-mounted volumes are durable; see infra/DEPLOY.md).

Shared fixture ``tests/conftest.py`` already sets DATABASE_URL and a
≥32-char APP_SECRET_KEY, so tests only override the field they target.
"""
from __future__ import annotations

import warnings

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _prod_cognito_s3_settings(**overrides: object) -> Settings:
    """Production posture using the cognito+s3 stack.

    Used to assert that each required Cognito / S3 var trips its validator
    when blanked out individually.
    """
    base: dict[str, object] = {
        "app_env": "production",
        "auth_provider": "cognito",
        "storage_backend": "s3",
        "cognito_user_pool_id": "ap-northeast-1_XXXXX",
        "cognito_client_id": "client-id-stub",
        "s3_bucket": "focustown-prod",
        "ses_from_email": "noreply@focustown.app",
        "notifier_backend": "ses",
        "secrets_backend": "aws",
        "reset_url_base": "https://focustown.app/reset-password",
        **overrides,
    }
    return Settings(**base)  # type: ignore[call-arg]


def _prod_lite_settings(**overrides: object) -> Settings:
    """Production posture using the single-VM "lite" stack.

    AUTH_PROVIDER=local_jwt + STORAGE_BACKEND=local + SECRETS_BACKEND=env
    is the supported MVP deploy shape (see infra/DEPLOY.md). The validator
    must accept this combination without demanding Cognito/S3 identifiers.
    """
    base: dict[str, object] = {
        "app_env": "production",
        "auth_provider": "local_jwt",
        "storage_backend": "local",
        "secrets_backend": "env",
        "notifier_backend": "ses",
        "ses_from_email": "noreply@focustown.app",
        "reset_url_base": "https://focustown.app/reset-password",
        **overrides,
    }
    return Settings(**base)  # type: ignore[call-arg]


# === Cognito enforcement (only when auth_provider=cognito) =================

def test_production_cognito_missing_user_pool_id_raises():
    with pytest.raises(ValidationError, match="COGNITO_USER_POOL_ID"):
        _prod_cognito_s3_settings(cognito_user_pool_id="")


def test_production_cognito_missing_client_id_raises():
    with pytest.raises(ValidationError, match="COGNITO_CLIENT_ID"):
        _prod_cognito_s3_settings(cognito_client_id="")


def test_production_local_jwt_does_not_require_cognito_vars():
    # The "lite" stack leaves cognito_* empty; validator must not raise.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # SECRETS_BACKEND=env warns
        s = _prod_lite_settings()
    assert s.auth_provider == "local_jwt"
    assert s.cognito_user_pool_id == ""


# === Storage enforcement (only when storage_backend=s3) ====================

def test_production_s3_missing_bucket_raises():
    with pytest.raises(ValidationError, match="S3_BUCKET"):
        _prod_cognito_s3_settings(s3_bucket="")


def test_production_local_storage_is_allowed():
    # Single-VM deploy with bind-mounted /opt/focustown/data is durable;
    # local storage must be accepted in production.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        s = _prod_lite_settings()
    assert s.storage_backend == "local"


# === Notifier enforcement (universal in prod) ==============================

def test_production_missing_ses_from_email_raises():
    # The field-level validator catches this first when notifier_backend=ses.
    with pytest.raises(ValidationError, match=r"ses_from_email|SES_FROM_EMAIL"):
        _prod_cognito_s3_settings(ses_from_email="")


def test_production_notifier_backend_log_raises():
    with pytest.raises(ValidationError, match="NOTIFIER_BACKEND"):
        _prod_cognito_s3_settings(notifier_backend="log")


# === Secrets backend warning (env in prod is allowed but flagged) ==========

def test_production_secrets_backend_env_warns_but_does_not_raise():
    with pytest.warns(RuntimeWarning, match="SECRETS_BACKEND=env"):
        s = _prod_cognito_s3_settings(secrets_backend="env")
    assert s.app_env == "production"


# === Non-prod environments are inert =======================================

def test_development_defaults_do_not_trigger_production_validator():
    # APP_ENV=test (from shared conftest) leaves the production validator
    # inert; instantiating without any AWS values should succeed silently.
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        s = Settings()  # type: ignore[call-arg]
    assert s.app_env == "test"
