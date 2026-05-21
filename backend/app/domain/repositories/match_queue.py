from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True, frozen=True)
class WaitEntry:
    user_id: str
    enqueued_at_ms: int
    fallback_deadline_ms: int


class IMatchingQueue(Protocol):
    """Port for the waiting-pool used by ``MatchingQueueService``.

    The queue is an ephemeral coordinator: it never stores user identity or
    history — only "who's currently waiting and how long until they timeout
    to bot fallback." All persistence lives in the regular ``Match`` table
    via ``MatchingService.propose`` after a pair is formed.

    Implementations MUST be safe to call concurrently from multiple
    processes (worker + N backend containers). Pair removal MUST be
    atomic so two concurrent sweeps cannot each pair the same user with
    a different partner. See ``atomic_remove_pair``.
    """

    async def enqueue(
        self,
        user_id: str,
        *,
        enqueued_at_ms: int,
        fallback_deadline_ms: int,
    ) -> bool:
        """Add ``user_id`` to the queue.

        Returns ``True`` if newly added, ``False`` if the user was already
        waiting (idempotent retry — caller should fetch the existing
        ``WaitEntry`` and return it as-is).
        """
        ...

    async def cancel(self, user_id: str) -> bool:
        """Remove ``user_id`` from the queue.

        Returns ``True`` iff the user was actually in the queue (so the
        worker disconnect hook can no-op cheaply when a non-waiter
        disconnects).
        """
        ...

    async def is_waiting(self, user_id: str) -> WaitEntry | None: ...

    async def list_waiters(self) -> list[WaitEntry]:
        """All current waiters, oldest first (FIFO)."""
        ...

    async def atomic_remove_pair(self, a: str, b: str) -> bool:
        """Atomically dequeue both users iff both are still waiting.

        Implemented as a Lua script in the Redis adapter so concurrent
        sweep ticks cannot each succeed and over-commit one of the users.
        Returns ``True`` iff both were present and removed.
        """
        ...

    async def list_due_for_fallback(self, *, now_ms: int) -> list[WaitEntry]:
        """Waiters whose ``fallback_deadline_ms <= now_ms``.

        These are candidates for bot fallback. Filtering is the queue's
        responsibility because the deadline lives in the per-user HASH,
        not the ZSET score (which is the enqueue timestamp).
        """
        ...
