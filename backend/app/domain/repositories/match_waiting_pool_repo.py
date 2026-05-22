from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

WaitingPoolStatus = Literal["waiting", "paired", "cancelled", "bot_fallback"]


@dataclass(slots=True, frozen=True)
class WaitingPoolRecord:
    """Domain projection of a ``match_waiting_pool`` row.

    Kept ORM-free so domain services (``MatchingQueueService``,
    ``MatchingQueueReconciler``) can depend on the protocol without
    pulling SQLAlchemy into the domain layer.
    """

    user_id: str
    status: WaitingPoolStatus
    enqueued_at_ms: int
    fallback_deadline_ms: int
    match_id: str | None


class IMatchWaitingPoolRepo(Protocol):
    """Source-of-truth port for the matching waiting pool.

    Redis (``IMatchingQueue``) remains the low-latency secondary index;
    this protocol is the authoritative record of "who asked to be matched
    and what happened to them." Phase 06 dual-writes through both — PG
    first, Redis second — so a Redis crash can be repaired by replaying
    rows from here.

    State machine:

    ``waiting`` --(_try_pair*)-->     ``paired``         (terminal)
                \\--(cancel)-->        ``cancelled``      (terminal)
                \\--(_fall_back_to_bot)--> ``bot_fallback`` (terminal)

    Re-enqueueing after a cancel is supported by ``upsert_waiting`` (an
    ON CONFLICT DO UPDATE on ``user_id``) so the user gets a fresh row
    with status reset to ``waiting``.
    """

    async def upsert_waiting(
        self,
        user_id: str,
        *,
        enqueued_at_ms: int,
        fallback_deadline_ms: int,
    ) -> None:
        """Create or refresh a waiting row for ``user_id``.

        Resets ``status`` to ``waiting``, clears any prior ``match_id``,
        and stamps fresh enqueue / fallback timings. Idempotent — a second
        call for the same user updates in place.
        """
        ...

    async def mark_paired(self, user_id: str, *, match_id: str) -> None:
        """Transition the row to ``paired`` with the new ``match_id``.

        Called inside the same flow as the Redis Lua atomic pair-remove.
        ``MatchingQueueService`` uses ``mark_pair_paired`` to flip BOTH
        sides in one UPDATE so the reconciler never sees a half-paired
        pair.
        """
        ...

    async def mark_pair_paired(
        self, user_a: str, user_b: str, *, match_id: str
    ) -> None:
        """Flip both sides of a pair to ``paired`` in one UPDATE.

        Avoids a half-state where one side is ``paired`` and the other
        is still ``waiting`` — the reconciler would otherwise try to
        re-enqueue the still-``waiting`` side and undo the pair.
        """
        ...

    async def mark_cancelled(self, user_id: str) -> None:
        """Terminal — user pressed CANCEL or their WS disconnected.

        No-op if no row exists; callers don't need to pre-check.
        """
        ...

    async def mark_bot_fallback(self, user_id: str) -> None:
        """Terminal — bot fallback was committed for this user.

        The reconciler MUST treat this as terminal and never re-enqueue
        to Redis, otherwise a flaky Redis restart would queue users who
        already got their bot match.
        """
        ...

    async def list_waiting(self) -> list[WaitingPoolRecord]:
        """All rows in ``waiting`` status, oldest first by ``enqueued_at_ms``.

        Used by the boot warm-up and the reconciliation tick.
        """
        ...

    async def get(self, user_id: str) -> WaitingPoolRecord | None: ...
