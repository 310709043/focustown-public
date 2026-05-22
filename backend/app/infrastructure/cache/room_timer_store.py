from __future__ import annotations

from redis.asyncio import Redis

from app.domain.services.room_timer_service import IRoomTimerStore


def _key(room_id: str) -> str:
    return f"room:timer:{room_id}"


class RedisRoomTimerStore(IRoomTimerStore):
    """Redis hash adapter for the per-room countdown state.

    One ``HSET`` + ``EXPIRE`` per ``session_started``; one ``HGETALL`` per
    tick. The TTL ceiling (duration + 60s grace) guarantees a crashed
    worker can't leak hashes — by the time the timer would have ended
    the key is gone anyway.
    """

    def __init__(self, redis: Redis) -> None:
        self._r = redis

    async def write(
        self,
        *,
        room_id: str,
        started_at_ms: int,
        duration_seconds: int,
        ttl_seconds: int,
    ) -> None:
        key = _key(room_id)
        # Pipeline so HSET + EXPIRE land as one round-trip — avoids the
        # window where a tick could read the hash before the TTL is set.
        async with self._r.pipeline(transaction=False) as pipe:
            await pipe.hset(
                key,
                mapping={
                    "started_at_ms": started_at_ms,
                    "duration_seconds": duration_seconds,
                },
            )
            await pipe.expire(key, ttl_seconds)
            await pipe.execute()

    async def read(self, room_id: str) -> dict[str, str] | None:
        raw = await self._r.hgetall(_key(room_id))
        if not raw:
            return None
        return raw

    async def delete(self, room_id: str) -> None:
        await self._r.delete(_key(room_id))
