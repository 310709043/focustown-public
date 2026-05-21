from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Literal

from app.core.clock import IClock
from app.core.logging import get_logger
from app.domain.models import Match
from app.domain.repositories.match_queue import IMatchingQueue, WaitEntry
from app.domain.repositories.match_repo import IMatchReader
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.user_repo import IUserReader
from app.domain.services.matching_service import MatchingService

log = get_logger(__name__)


# How many of the requester's most recent matches to de-duplicate against
# when picking a partner. Mirrors the constant the legacy ``/matches/auto``
# router previously held; moved here because the queue-aware flow needs it
# in both the immediate-pair branch and the periodic sweep.
RECENT_DEDUP_WINDOW = 14

# Random window for bot fallback. 25-30s is the user-confirmed default
# (see /home/docker_admin/.claude/plans/town-page-cached-sun.md). Each
# user samples once at enqueue time so the deadline is fixed for them -
# avoids cliff-edge timing where every waiter falls back simultaneously.
DEFAULT_BOT_FALLBACK_MIN_MS = 25_000
DEFAULT_BOT_FALLBACK_MAX_MS = 30_000


@dataclass(slots=True, frozen=True)
class WaitingResult:
    enqueued_at_ms: int
    bot_fallback_at_ms: int
    status: Literal["waiting"] = "waiting"


@dataclass(slots=True, frozen=True)
class MatchedResult:
    match: Match
    via: Literal["waiting_pool"]
    status: Literal["matched"] = "matched"


RequestResult = WaitingResult | MatchedResult


class MatchingQueueService:
    """Waiting-pool coordinator on top of ``MatchingService``.

    Flow:
        1. ``request(user_id)`` — try to pair the requester with an existing
           waiter (FIFO, dedup-aware). If no pair is possible, enqueue and
           return ``WaitingResult``. If pair succeeds, return ``MatchedResult``.
        2. ``sweep()`` — periodic worker tick. Re-attempts pairing for any
           waiters who couldn't pair at enqueue time (e.g. they joined first
           and waited for someone else), and bot-falls-back anyone past
           their per-user deadline.
        3. ``cancel(user_id)`` — removes a user from the queue. Called on
           WebSocket disconnect and by the user-initiated cancel endpoint.

    The service wraps ``MatchingService.propose`` rather than reaching into
    ``IMatchRepo`` directly so the existing ``MatchProposed`` event and
    PENDING status invariant remain intact. Bot fallback also uses
    ``MatchingService.propose`` + ``accept`` for the same reason — only the
    *trigger* (queue tick) is new.
    """

    def __init__(
        self,
        *,
        queue: IMatchingQueue,
        matching: MatchingService,
        matches_reader: IMatchReader,
        users: IUserReader,
        publisher: IRealtimePublisher,
        clock: IClock,
        rng: random.Random | None = None,
        bot_fallback_min_ms: int = DEFAULT_BOT_FALLBACK_MIN_MS,
        bot_fallback_max_ms: int = DEFAULT_BOT_FALLBACK_MAX_MS,
    ) -> None:
        self._queue = queue
        self._matching = matching
        self._matches_reader = matches_reader
        self._users = users
        self._pub = publisher
        self._clock = clock
        self._rng = rng or random.Random()  # noqa: S311
        self._fallback_min_ms = bot_fallback_min_ms
        self._fallback_max_ms = bot_fallback_max_ms

    def _now_ms(self) -> int:
        return int(self._clock.now().timestamp() * 1000)

    def _pick_fallback_deadline(self, now_ms: int) -> int:
        offset = self._rng.randint(self._fallback_min_ms, self._fallback_max_ms)
        return now_ms + offset

    async def _recent_partners(self, user_id: str) -> set[str]:
        recent = await self._matches_reader.list_recent_for_user(
            user_id=user_id, limit=RECENT_DEDUP_WINDOW
        )
        return {
            m.candidate_id if m.requester_id == user_id else m.requester_id
            for m in recent
        }

    async def request(self, *, requester_id: str) -> RequestResult:
        existing = await self._queue.is_waiting(requester_id)
        if existing is not None:
            return WaitingResult(
                enqueued_at_ms=existing.enqueued_at_ms,
                bot_fallback_at_ms=existing.fallback_deadline_ms,
            )

        recent = await self._recent_partners(requester_id)
        waiters = await self._queue.list_waiters()
        for w in waiters:
            if w.user_id == requester_id:
                continue
            if w.user_id in recent:
                continue
            # Immediate-pair: the requester is NOT yet in the queue, so we
            # only need to atomically remove the waiter (single-sided
            # ZREM). The Lua pair-remove is for the sweep path where BOTH
            # sides are in the queue.
            paired = await self._try_pair_with_waiter(requester_id, w.user_id)
            if paired is not None:
                return MatchedResult(match=paired, via="waiting_pool")

        now_ms = self._now_ms()
        deadline = self._pick_fallback_deadline(now_ms)
        added = await self._queue.enqueue(
            requester_id,
            enqueued_at_ms=now_ms,
            fallback_deadline_ms=deadline,
        )
        if not added:
            existing = await self._queue.is_waiting(requester_id)
            if existing is not None:
                return WaitingResult(
                    enqueued_at_ms=existing.enqueued_at_ms,
                    bot_fallback_at_ms=existing.fallback_deadline_ms,
                )
        return WaitingResult(
            enqueued_at_ms=now_ms,
            bot_fallback_at_ms=deadline,
        )

    async def cancel(self, *, user_id: str) -> None:
        await self._queue.cancel(user_id)

    async def status(self, *, user_id: str) -> WaitEntry | None:
        return await self._queue.is_waiting(user_id)

    async def sweep(self) -> None:
        waiters = await self._queue.list_waiters()
        paired_in_tick: set[str] = set()

        for i, a in enumerate(waiters):
            if a.user_id in paired_in_tick:
                continue
            recent_a = await self._recent_partners(a.user_id)
            for b in waiters[i + 1 :]:
                if b.user_id in paired_in_tick:
                    continue
                if b.user_id in recent_a:
                    continue
                paired = await self._try_pair(a.user_id, b.user_id)
                if paired is not None:
                    paired_in_tick.add(a.user_id)
                    paired_in_tick.add(b.user_id)
                    break

        now_ms = self._now_ms()
        due = await self._queue.list_due_for_fallback(now_ms=now_ms)
        for waiter in due:
            if waiter.user_id in paired_in_tick:
                continue
            try:
                await self._fall_back_to_bot(waiter.user_id)
                paired_in_tick.add(waiter.user_id)
            except Exception:
                log.exception(
                    "matching_queue_bot_fallback_failed",
                    user_id=waiter.user_id,
                )

    async def _try_pair(self, a: str, b: str) -> Match | None:
        """Sweep path: both ``a`` and ``b`` are currently in the queue.

        Uses the Lua atomic ``ZREM``+``ZREM`` script so two parallel
        sweep ticks cannot each pair the same user with a different
        partner.
        """
        removed = await self._queue.atomic_remove_pair(a, b)
        if not removed:
            return None
        try:
            match = await self._matching.propose(
                requester_id=a, candidate_id=b
            )
        except Exception:
            log.exception(
                "matching_queue_propose_failed", requester_id=a, candidate_id=b
            )
            return None
        await self._notify_pair(a, b, match, via="waiting_pool")
        return match

    async def _try_pair_with_waiter(
        self, requester_id: str, waiter_id: str
    ) -> Match | None:
        """Immediate-pair path: only ``waiter_id`` is in the queue;
        ``requester_id`` is the one currently calling ``request`` and has
        not been enqueued yet.

        Atomicity reduces to a single ``ZREM`` on ``waiter_id`` (the
        underlying Redis primitive). If the waiter vanished between
        ``list_waiters`` and now (cancelled, paired by sweep, TTL
        expired), ``cancel`` returns ``False`` and we report no pair —
        the caller proceeds to enqueue.
        """
        removed = await self._queue.cancel(waiter_id)
        if not removed:
            return None
        try:
            match = await self._matching.propose(
                requester_id=requester_id, candidate_id=waiter_id
            )
        except Exception:
            log.exception(
                "matching_queue_propose_failed",
                requester_id=requester_id,
                candidate_id=waiter_id,
            )
            return None
        await self._notify_pair(
            requester_id, waiter_id, match, via="waiting_pool"
        )
        return match

    async def _notify_pair(
        self, a: str, b: str, match: Match, *, via: str
    ) -> None:
        """Fan out ``match.proposed`` to both sides.

        The existing ``MatchRealtimeLink`` already fires on
        ``MatchProposed`` and publishes a (sparser) frame to the
        candidate's channel. The frontend ``useRealtimeMatch`` guards on
        ``status === "waiting"`` so a second frame for the candidate is a
        no-op (idempotent transition). We still publish a richer payload
        here so the requester (which ``MatchRealtimeLink`` deliberately
        skips) gets notified, and both sides see consistent
        ``partner_*`` metadata.
        """
        users = await self._users.get_many_by_ids([a, b])
        by_id = {u.id: u for u in users}
        for self_id, partner_id in ((a, b), (b, a)):
            partner = by_id.get(partner_id)
            payload = {
                "type": "match.proposed",
                "match_id": match.id,
                "via": via,
                "compatibility": match.compatibility,
                "from": partner_id,
                "partner_id": partner_id,
                "partner_character_key": partner.character_key if partner else None,
                "partner_is_bot": bool(partner.is_bot) if partner else False,
            }
            await self._pub.publish(
                IRealtimePublisher.user_channel(self_id), payload
            )

    async def _fall_back_to_bot(self, user_id: str) -> None:
        recent = await self._recent_partners(user_id)
        bots = await self._users.list_bots()
        if not bots:
            await self._queue.cancel(user_id)
            return
        eligible = [b for b in bots if b.id not in recent] or bots
        chosen = self._rng.choice(eligible)
        removed = await self._queue.cancel(user_id)
        if not removed:
            return
        match = await self._matching.propose(
            requester_id=user_id, candidate_id=chosen.id
        )
        accepted = await self._matching.accept(
            match_id=match.id, user_id=chosen.id
        )
        payload = {
            "type": "match.proposed",
            "match_id": accepted.id,
            "via": "bot_fallback",
            "compatibility": accepted.compatibility,
            "from": chosen.id,
            "partner_id": chosen.id,
            "partner_character_key": chosen.character_key,
            "partner_is_bot": True,
        }
        await self._pub.publish(
            IRealtimePublisher.user_channel(user_id), payload
        )
