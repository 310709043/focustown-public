from __future__ import annotations

from redis.asyncio import Redis

_client: Redis | None = None


async def init_redis(url: str) -> Redis:
    global _client
    if _client is None:
        _client = Redis.from_url(url, encoding="utf-8", decode_responses=True)
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
