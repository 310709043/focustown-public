from __future__ import annotations

import ipaddress
import warnings
from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: Literal["development", "staging", "production", "test"] = "development"
    app_debug: bool = False
    app_secret_key: str = Field(min_length=32)
    app_cors_origins: str = "http://localhost:3000"

    # Comma-separated list of IPs or CIDR ranges that the app trusts to set
    # X-Forwarded-For. Anything not in this set is treated as a direct
    # connection and the socket peer is used. Empty (default) = trust nothing.
    app_trusted_proxies: str = ""

    database_url: str
    redis_url: str = "redis://redis:6379/0"
    # ElastiCache AUTH token. When set, overrides any password embedded in
    # redis_url; rediss:// scheme in redis_url is the TLS trigger.
    redis_auth_token: str = ""

    auth_provider: Literal["local_jwt", "cognito"] = "local_jwt"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_min: int = 30
    jwt_refresh_ttl_days: int = 14

    aws_region: str = "ap-northeast-1"
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    cognito_client_secret: str = ""
    cognito_endpoint_url: str = ""
    cognito_jwks_ttl_seconds: int = 3600
    s3_bucket: str = ""

    # Notification dispatch. "log" writes to structured logs (dev / test);
    # "ses" sends real email via AWS SES v2. ses_from_email must be set
    # whenever notifier_backend=ses in production.
    notifier_backend: Literal["log", "ses"] = "log"
    ses_from_email: str = ""
    ses_endpoint_url: str = ""

    # Secrets dispatch. "env" reads from process env vars (current behaviour);
    # "aws" pulls from AWS Secrets Manager with an in-memory TTL cache so we
    # don't hit the API on every request.
    secrets_backend: Literal["env", "aws"] = "env"
    secrets_cache_ttl_seconds: int = 300
    secrets_endpoint_url: str = ""

    reset_token_ttl_hours: int = 1
    reset_url_base: str = "http://localhost:3000/reset-password"
    terms_current_version: str = "2026-05-14"

    # Track library storage. V1 ships a seeded-only catalog (no user
    # uploads), but the storage abstraction stays: the dev-data seeder
    # writes through IFileStorage, and the streaming endpoint serves
    # bytes back via FileResponse / S3 presigned redirect.
    # storage_backend dispatches IFileStorage adapter via
    # infrastructure.storage.factory.make_storage().
    storage_backend: Literal["local", "s3"] = "local"
    storage_root: str = "/app/data/storage"

    # S3 / MinIO settings. All blank by default so production deploys with
    # IAM role + boto3 default endpoint work unchanged. For local MinIO see
    # docker-compose.s3.yml: endpoint_url=http://minio:9000 (in-cluster),
    # public_endpoint_url=http://localhost:9000 (presigned URL host used by
    # the browser — MinIO does not sign the Host header, so a different
    # host in the signed URL is still valid).
    s3_endpoint_url: str = ""
    s3_public_endpoint_url: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_presign_ttl_seconds: int = 3600

    # Auth-endpoint rate limits. Centralised here so an operator can tune
    # them per environment (e.g. relax in dev, tighten in prod) without
    # editing router code. Defaults preserve the original hardcoded values.
    auth_rl_signup_per_ip_per_hour: int = 10
    auth_rl_signin_per_email_per_min: int = 5
    auth_rl_signin_per_ip_per_hour: int = 30
    auth_rl_forgot_per_ip_per_hour: int = 5
    auth_rl_forgot_per_email_per_hour: int = 3
    auth_rl_reset_per_ip_per_hour: int = 10
    # Refresh is the only auth path that previously had no limiter — a stolen
    # refresh token could be replayed at line rate. 60/hr per IP comfortably
    # covers a tab-heavy user (refresh interval ~25 min, ~3 tabs).
    auth_rl_refresh_per_ip_per_hour: int = 60

    # WebSocket + expensive-read rate limits. Per-IP windows guard against
    # connection-spam (auth probing pre-JWT-decode) and scraping.
    ws_rl_connect_per_ip_per_min: int = 30
    read_rl_leaderboard_per_ip_per_min: int = 120
    read_rl_presence_per_ip_per_min: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.app_cors_origins.split(",") if o.strip()]

    @property
    def trusted_proxy_networks(self) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
        nets: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
        for raw in self.app_trusted_proxies.split(","):
            raw = raw.strip()
            if not raw:
                continue
            try:
                nets.append(ipaddress.ip_network(raw, strict=False))
            except ValueError:
                # Silently skip malformed entries; misconfig should not crash app.
                continue
        return nets

    @field_validator("reset_url_base")
    @classmethod
    def _validate_reset_url(cls, v: str, info: ValidationInfo) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("reset_url_base must be an absolute http(s) URL")
        env = info.data.get("app_env", "development")
        if env == "production" and parsed.scheme != "https":
            raise ValueError("reset_url_base must use https in production")
        return v

    @field_validator("ses_from_email")
    @classmethod
    def _validate_ses_from_email(cls, v: str, info: ValidationInfo) -> str:
        # Empty is fine unless we're going to actually dispatch via SES in
        # production. Catching this at boot prevents the password-reset path
        # from silently dropping mail because boto3 rejects an empty Source.
        backend = info.data.get("notifier_backend", "log")
        env = info.data.get("app_env", "development")
        if backend == "ses" and env == "production" and not v:
            raise ValueError("ses_from_email is required when notifier_backend=ses in production")
        return v

    @model_validator(mode="after")
    def _validate_production_posture(self) -> Settings:
        # Fail fast at boot when APP_ENV=production but the chosen-backend's
        # required env vars are missing. Surfacing UPPER_CASE names matches
        # how ECS task-def / Lightsail .env operators see them.
        if self.app_env != "production":
            return self

        # Auth: Cognito needs its pool identifiers. local_jwt only needs the
        # APP_SECRET_KEY guarded by the field-level validator at any env.
        if self.auth_provider == "cognito":
            cognito_required = {
                "COGNITO_USER_POOL_ID": self.cognito_user_pool_id,
                "COGNITO_CLIENT_ID": self.cognito_client_id,
            }
            for var, value in cognito_required.items():
                if not value:
                    raise ValueError(
                        f"{var} must be set when AUTH_PROVIDER=cognito in production"
                    )

        # Storage: production runs on Lightsail Container Service, whose
        # filesystem is ephemeral across deployments. Local-FS storage is
        # therefore forbidden; uploaded files would vanish on the next
        # deploy. See infra/lightsail/bootstrap.md for the S3 bucket the
        # app expects.
        if self.storage_backend != "s3":
            raise ValueError(
                "STORAGE_BACKEND must be 's3' in production "
                "(Lightsail Container Service has no persistent volumes)"
            )
        if not self.s3_bucket:
            raise ValueError(
                "S3_BUCKET must be set when STORAGE_BACKEND=s3 in production"
            )

        # Notifier: log is forbidden in prod (silent email loss).
        # ses_from_email is enforced separately by _validate_ses_from_email.
        if self.notifier_backend == "log":
            raise ValueError(
                "NOTIFIER_BACKEND must not be 'log' in production "
                "(set to 'ses' for real email delivery)"
            )

        if self.secrets_backend == "env":
            # ECS task-def env injection OR a chmod-600 .env on a single VM
            # are both legitimate in-prod patterns. Warn so an operator who
            # ended up here by accident notices.
            warnings.warn(
                "Production with SECRETS_BACKEND=env relies on the operator "
                "injecting secrets via env-file or task-def — confirm this is "
                "intentional.",
                RuntimeWarning,
                stacklevel=2,
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
