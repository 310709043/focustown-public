from __future__ import annotations

import ipaddress
from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, ValidationInfo, field_validator
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


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
