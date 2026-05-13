from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.app_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
