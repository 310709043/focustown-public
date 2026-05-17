from __future__ import annotations

from typing import Any

from redis.asyncio import Redis

_client: Redis | None = None


async def init_redis(url: str, auth_token: str = "") -> Redis:
    # rediss:// scheme in url auto-enables TLS via redis-py >= 5.0. auth_token
    # overrides any password embedded in the URL — keeps the secret out of
    # process listings and log lines that echo the URL.
    global _client
    if _client is None:
        kwargs: dict[str, Any] = {"encoding": "utf-8", "decode_responses": True}
        if auth_token:
            kwargs["password"] = auth_token
        _client = Redis.from_url(url, **kwargs)
        await _client.ping()
    return _client


def get_redis() -> Redis:
    if _client is None:
        raise RuntimeError("redis not initialized; call init_redis() in lifespan")
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
