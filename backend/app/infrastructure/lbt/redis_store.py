"""Redis adapter for ``ILbtStore``.

Key layout (all under ``lbt:``):

  lbt:online                 ZSET guest → last-seen epoch seconds
  lbt:queue                  ZSET guest → joined epoch seconds
  lbt:waiting:{guest}        profile JSON for a queued guest (1 h TTL)
  lbt:conv:{id}              conversation JSON
  lbt:active                 SET of open conversation ids
  lbt:guest:{guest}:conv     open conversation id
  lbt:guest:{guest}:last     most recent closed conversation id (for reports)
  lbt:transcript:{id}        LIST of line JSON, capped
  lbt:extend:{id}            SET of guests who asked to extend (Lua, atomic)
  lbt:blocked:{guest}        SET of guests never to pair with again (TTL)
  lbt:lock:pair              pairing mutex (SET NX PX)

Closed conversations and their transcripts expire after ``keep_for``.
"""
from __future__ import annotations

import json
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis

from app.domain.models.lbt import LbtConversation, LbtProfile, LbtWaiting
from app.domain.repositories.lbt import ILbtStore, LbtTranscriptLine

ONLINE = "lbt:online"
QUEUE = "lbt:queue"
ACTIVE = "lbt:active"
PAIR_LOCK = "lbt:lock:pair"

TRANSCRIPT_MAX_LINES = 400
# Upper bound on how long an *open* conversation's keys may live if the
# process that should close it disappears. Sweeps close conversations long
# before this; it only stops leaks.
OPEN_CONVERSATION_TTL = timedelta(hours=6)
WAITING_TTL = timedelta(hours=1)
LOCK_TTL_MS = 5000

# Add a vote and, if that makes two, clear the set and report completion —
# all in one step, so concurrent votes on two processes can neither lose a
# vote nor both trigger the extension.
_VOTE_EXTEND = """
redis.call('sadd', KEYS[1], ARGV[1])
redis.call('expire', KEYS[1], ARGV[2])
if redis.call('scard', KEYS[1]) >= 2 then
  redis.call('del', KEYS[1])
  return 1
end
return 0
"""

_RELEASE_LOCK = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
"""


def _ts(moment: datetime) -> float:
    return moment.timestamp()


def _from_ts(value: float) -> datetime:
    return datetime.fromtimestamp(value, tz=UTC)


def _waiting_key(guest_id: str) -> str:
    return f"lbt:waiting:{guest_id}"


def _conv_key(conversation_id: str) -> str:
    return f"lbt:conv:{conversation_id}"


def _guest_conv_key(guest_id: str) -> str:
    return f"lbt:guest:{guest_id}:conv"


def _guest_last_key(guest_id: str) -> str:
    return f"lbt:guest:{guest_id}:last"


def _transcript_key(conversation_id: str) -> str:
    return f"lbt:transcript:{conversation_id}"


def _extend_key(conversation_id: str) -> str:
    return f"lbt:extend:{conversation_id}"


def _blocked_key(guest_id: str) -> str:
    return f"lbt:blocked:{guest_id}"


class RedisLbtStore(ILbtStore):
    def __init__(self, redis: Redis) -> None:
        self._r = redis

    # presence
    async def touch_online(self, guest_id: str, now: datetime) -> None:
        await self._r.zadd(ONLINE, {guest_id: _ts(now)})

    async def drop_online(self, guest_id: str) -> None:
        await self._r.zrem(ONLINE, guest_id)

    async def last_seen(self, guest_id: str) -> datetime | None:
        score = await self._r.zscore(ONLINE, guest_id)
        return None if score is None else _from_ts(float(score))

    async def count_online(self, since: datetime) -> int:
        return int(await self._r.zcount(ONLINE, _ts(since), "+inf"))

    async def prune_online(self, before: datetime) -> None:
        await self._r.zremrangebyscore(ONLINE, "-inf", f"({_ts(before)}")

    # waiting room
    async def enqueue(self, waiting: LbtWaiting) -> None:
        pipe = self._r.pipeline(transaction=True)
        pipe.set(
            _waiting_key(waiting.guest_id),
            json.dumps(waiting.profile.to_dict()),
            ex=int(WAITING_TTL.total_seconds()),
        )
        pipe.zadd(QUEUE, {waiting.guest_id: _ts(waiting.joined_at)})
        await pipe.execute()

    async def dequeue(self, guest_id: str) -> bool:
        pipe = self._r.pipeline(transaction=True)
        pipe.zrem(QUEUE, guest_id)
        pipe.delete(_waiting_key(guest_id))
        removed, _ = await pipe.execute()
        return bool(removed)

    async def list_waiting(self) -> list[LbtWaiting]:
        entries = await self._r.zrange(QUEUE, 0, -1, withscores=True)
        if not entries:
            return []
        profiles = await self._r.mget([_waiting_key(g) for g, _ in entries])
        result: list[LbtWaiting] = []
        for (guest_id, score), raw in zip(entries, profiles, strict=True):
            if raw is None:
                # Profile expired but the queue entry did not: drop it.
                await self._r.zrem(QUEUE, guest_id)
                continue
            result.append(
                LbtWaiting(
                    guest_id=guest_id,
                    profile=LbtProfile.from_dict(json.loads(raw)),
                    joined_at=_from_ts(float(score)),
                )
            )
        return result

    @asynccontextmanager
    async def pairing_lock(self) -> AsyncIterator[bool]:
        token = secrets.token_hex(16)
        acquired = bool(await self._r.set(PAIR_LOCK, token, nx=True, px=LOCK_TTL_MS))
        try:
            yield acquired
        finally:
            if acquired:
                await self._r.eval(_RELEASE_LOCK, 1, PAIR_LOCK, token)

    # conversations
    async def save_conversation(self, conversation: LbtConversation) -> None:
        ttl = int(OPEN_CONVERSATION_TTL.total_seconds())
        pipe = self._r.pipeline(transaction=True)
        pipe.set(_conv_key(conversation.id), json.dumps(conversation.to_dict()), ex=ttl)
        pipe.sadd(ACTIVE, conversation.id)
        pipe.set(_guest_conv_key(conversation.guest_a), conversation.id, ex=ttl)
        pipe.set(_guest_conv_key(conversation.guest_b), conversation.id, ex=ttl)
        await pipe.execute()

    async def get_conversation(self, conversation_id: str) -> LbtConversation | None:
        raw = await self._r.get(_conv_key(conversation_id))
        return None if raw is None else LbtConversation.from_dict(json.loads(raw))

    async def conversation_id_of(self, guest_id: str) -> str | None:
        return await self._r.get(_guest_conv_key(guest_id))

    async def last_conversation_id_of(self, guest_id: str) -> str | None:
        return await self._r.get(_guest_last_key(guest_id))

    async def active_conversation_ids(self) -> list[str]:
        return sorted(await self._r.smembers(ACTIVE))

    async def close_conversation(
        self, conversation: LbtConversation, *, keep_for: timedelta
    ) -> None:
        keep = int(keep_for.total_seconds())
        pipe = self._r.pipeline(transaction=True)
        pipe.srem(ACTIVE, conversation.id)
        for guest in (conversation.guest_a, conversation.guest_b):
            pipe.delete(_guest_conv_key(guest))
            pipe.set(_guest_last_key(guest), conversation.id, ex=keep)
        pipe.expire(_conv_key(conversation.id), keep)
        pipe.expire(_transcript_key(conversation.id), keep)
        pipe.delete(_extend_key(conversation.id))
        await pipe.execute()

    async def add_extend_vote(self, conversation_id: str, guest_id: str) -> bool:
        ttl = int(OPEN_CONVERSATION_TTL.total_seconds())
        completed = await self._r.eval(
            _VOTE_EXTEND, 1, _extend_key(conversation_id), guest_id, ttl
        )
        return bool(completed)

    async def extend_votes(self, conversation_id: str) -> set[str]:
        return set(await self._r.smembers(_extend_key(conversation_id)))

    async def append_line(self, conversation_id: str, line: LbtTranscriptLine) -> None:
        key = _transcript_key(conversation_id)
        pipe = self._r.pipeline(transaction=True)
        pipe.rpush(key, json.dumps(line.to_dict()))
        pipe.ltrim(key, -TRANSCRIPT_MAX_LINES, -1)
        pipe.expire(key, int(OPEN_CONVERSATION_TTL.total_seconds()))
        await pipe.execute()

    async def transcript(self, conversation_id: str) -> list[LbtTranscriptLine]:
        raw = await self._r.lrange(_transcript_key(conversation_id), 0, -1)
        return [LbtTranscriptLine.from_dict(json.loads(item)) for item in raw]

    # safety
    async def block_pair(self, guest_a: str, guest_b: str, ttl: timedelta) -> None:
        seconds = int(ttl.total_seconds())
        pipe = self._r.pipeline(transaction=True)
        pipe.sadd(_blocked_key(guest_a), guest_b)
        pipe.expire(_blocked_key(guest_a), seconds)
        pipe.sadd(_blocked_key(guest_b), guest_a)
        pipe.expire(_blocked_key(guest_b), seconds)
        await pipe.execute()

    async def blocked_for(self, guest_id: str) -> set[str]:
        return set(await self._r.smembers(_blocked_key(guest_id)))
