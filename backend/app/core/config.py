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
    s3_bucket: str = ""

    reset_token_ttl_hours: int = 1
    reset_url_base: str = "http://localhost:3000/reset-password"
    terms_current_version: str = "2026-05-14"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
