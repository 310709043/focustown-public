from __future__ import annotations

from redis.asyncio import Redis

from app.domain.repositories.match_queue import IMatchingQueue, WaitEntry

# Atomically remove both users from the waiting ZSET iff both are still
# present. Returns 1 on success, 0 on failure (race: at least one side
# already paired/cancelled by another worker / tab).
#
# Using a Lua script (rather than MULTI/EXEC) because we need a CONDITIONAL
# write: ZSCORE both, then ZREM both only if both checks pass. MULTI/EXEC
# would commit unconditionally — opening a window where two parallel
# sweeps each pair `a` with a different partner.
#
# KEYS[1] — queue ZSET
# KEYS[2] — hash for user A
# KEYS[3] — hash for user B
# ARGV[1] — user id A
# ARGV[2] — user id B
_LUA_REMOVE_PAIR = """
if redis.call('ZSCORE', KEYS[1], ARGV[1]) and redis.call('ZSCORE', KEYS[1], ARGV[2]) then
    redis.call('ZREM', KEYS[1], ARGV[1])
    redis.call('ZREM', KEYS[1], ARGV[2])
    redis.call('DEL', KEYS[2])
    redis.call('DEL', KEYS[3])
    return 1
else
    return 0
end
"""


class RedisMatchingQueue(IMatchingQueue):
    """Redis-backed waiting pool.

    Key layout::

        match:wait:queue            ZSET — score = enqueued_at_ms, member = user_id
        match:wait:user:{user_id}   HASH {enqueued_at_ms, fallback_deadline_ms}, TTL 120s

    The ZSET is the source of truth for "who is waiting." The per-user HASH
    carries the bot-fallback deadline (which the ZSET score can't carry —
    we need both enqueue order and deadline). The HASH TTL is a defense
    in depth against crashed processes: if a process dies before its
    finally-block can call ``cancel()``, the entry expires after 120s and
    the sweep's stale-check (``list_waiters`` self-prunes when HASH is
    missing) cleans up the dangling ZSET member.
    """

    QUEUE_KEY = "match:wait:queue"
    USER_KEY_FMT = "match:wait:user:{user_id}"
    TTL_SECONDS = 120

    def __init__(self, redis: Redis) -> None:
        self._r = redis

    def _user_key(self, user_id: str) -> str:
        return self.USER_KEY_FMT.format(user_id=user_id)

    async def enqueue(
        self,
        user_id: str,
        *,
        enqueued_at_ms: int,
        fallback_deadline_ms: int,
    ) -> bool:
        added = await self._r.zadd(
            self.QUEUE_KEY, {user_id: enqueued_at_ms}, nx=True
        )
        if not added:
            return False
        key = self._user_key(user_id)
        async with self._r.pipeline(transaction=False) as p:
            p.hset(
                key,
                mapping={
                    "enqueued_at_ms": str(enqueued_at_ms),
                    "fallback_deadline_ms": str(fallback_deadline_ms),
                },
            )
            p.expire(key, self.TTL_SECONDS)
            await p.execute()
        return True

    async def cancel(self, user_id: str) -> bool:
        async with self._r.pipeline(transaction=False) as p:
            p.zrem(self.QUEUE_KEY, user_id)
            p.delete(self._user_key(user_id))
            results = await p.execute()
        return bool(results[0])

    async def is_waiting(self, user_id: str) -> WaitEntry | None:
        raw = await self._r.hgetall(self._user_key(user_id))
        if not raw:
            return None
        return self._row_to_entry(user_id, raw)

    async def list_waiters(self) -> list[WaitEntry]:
        rows = await self._r.zrange(self.QUEUE_KEY, 0, -1, withscores=True)
        if not rows:
            return []
        out: list[WaitEntry] = []
        stale: list[str] = []
        for user_id, _score in rows:
            raw = await self._r.hgetall(self._user_key(user_id))
            if not raw:
                stale.append(user_id)
                continue
            out.append(self._row_to_entry(user_id, raw))
        if stale:
            await self._r.zrem(self.QUEUE_KEY, *stale)
        return out

    async def atomic_remove_pair(self, a: str, b: str) -> bool:
        result = await self._r.eval(
            _LUA_REMOVE_PAIR,
            3,
            self.QUEUE_KEY,
            self._user_key(a),
            self._user_key(b),
            a,
            b,
        )
        return result == 1

    async def list_due_for_fallback(self, *, now_ms: int) -> list[WaitEntry]:
        waiters = await self.list_waiters()
        return [w for w in waiters if w.fallback_deadline_ms <= now_ms]

    @staticmethod
    def _row_to_entry(user_id: str, raw: dict[str, str]) -> WaitEntry:
        return WaitEntry(
            user_id=user_id,
            enqueued_at_ms=int(raw["enqueued_at_ms"]),
            fallback_deadline_ms=int(raw["fallback_deadline_ms"]),
        )
