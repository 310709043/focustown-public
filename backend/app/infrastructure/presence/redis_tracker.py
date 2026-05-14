from __future__ import annotations

from datetime import datetime
from typing import cast

from redis.asyncio import Redis

from app.core.clock import IClock
from app.domain.repositories.presence import (
    IPresenceTracker,
    PresenceEntry,
    PresenceState,
)


class RedisPresenceTracker(IPresenceTracker):
    """Redis-backed presence tracker.

    Key layout:
        presence:online          SET of user_id (membership = "is connected")
        presence:user:<user_id>  HASH {state, status, last_seen_at}, TTL safety-net

    The SET membership is the source of truth for "who is online"; the per-user
    HASH carries the state/status. TTL on the HASH (and SET cleanup on miss)
    prevents zombie entries if a process crashes before the WS disconnect path
    runs. Normal disconnects remove both atomically.
    """

    PRESENCE_KEY = "presence:online"
    USER_KEY_FMT = "presence:user:{user_id}"
    TTL_SECONDS = 90

    def __init__(self, redis: Redis, clock: IClock) -> None:
        self._r = redis
        self._clock = clock

    def _key(self, user_id: str) -> str:
        return self.USER_KEY_FMT.format(user_id=user_id)

    async def online(
        self,
        user_id: str,
        *,
        state: PresenceState = "on_street",
        status: str = "focus",
    ) -> None:
        now = self._clock.now()
        async with self._r.pipeline(transaction=False) as p:
            p.hset(
                self._key(user_id),
                mapping={
                    "state": state,
                    "status": status,
                    "last_seen_at": now.isoformat(),
                },
            )
            p.expire(self._key(user_id), self.TTL_SECONDS)
            p.sadd(self.PRESENCE_KEY, user_id)
            await p.execute()

    async def offline(self, user_id: str) -> None:
        async with self._r.pipeline(transaction=False) as p:
            p.delete(self._key(user_id))
            p.srem(self.PRESENCE_KEY, user_id)
            await p.execute()

    async def update(
        self,
        user_id: str,
        *,
        state: PresenceState | None = None,
        status: str | None = None,
    ) -> None:
        now = self._clock.now()
        mapping: dict[str, str] = {"last_seen_at": now.isoformat()}
        if state is not None:
            mapping["state"] = state
        if status is not None:
            mapping["status"] = status
        async with self._r.pipeline(transaction=False) as p:
            p.hset(self._key(user_id), mapping=mapping)
            p.expire(self._key(user_id), self.TTL_SECONDS)
            await p.execute()

    async def get(self, user_id: str) -> PresenceEntry | None:
        raw = await self._r.hgetall(self._key(user_id))
        if not raw:
            return None
        return self._row_to_entry(user_id, raw)

    async def list(
        self, *, state: PresenceState | None = None
    ) -> list[PresenceEntry]:
        user_ids = await self._r.smembers(self.PRESENCE_KEY)
        if not user_ids:
            return []
        async with self._r.pipeline(transaction=False) as p:
            for uid in user_ids:
                p.hgetall(self._key(uid))
            rows = await p.execute()
        out: list[PresenceEntry] = []
        stale: list[str] = []
        for uid, raw in zip(user_ids, rows, strict=True):
            if not raw:
                stale.append(uid)
                continue
            entry = self._row_to_entry(uid, raw)
            if state is not None and entry.state != state:
                continue
            out.append(entry)
        if stale:
            await self._r.srem(self.PRESENCE_KEY, *stale)
        return out

    @staticmethod
    def _row_to_entry(user_id: str, raw: dict[str, str]) -> PresenceEntry:
        return PresenceEntry(
            user_id=user_id,
            state=cast(PresenceState, raw.get("state", "offline")),
            status=raw.get("status", "focus"),
            last_seen_at=datetime.fromisoformat(raw["last_seen_at"]),
        )
