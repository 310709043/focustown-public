from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.core.clock import IClock
from app.core.exceptions import (
    BusinessError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.ids import IIdGenerator
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.friendship_repo import Friendship, IFriendshipRepo
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.user_repo import IUserRepo

STATUS_REQUESTED = "requested"
STATUS_ACCEPTED = "accepted"
STATUS_BLOCKED = "blocked"


@dataclass(slots=True, frozen=True)
class FriendSummary:
    """Lightweight friendship view used by list endpoints — flat shape
    so the FE doesn't need a graph traversal helper."""

    friendship_id: str
    user_id: str  # the OTHER side from the caller's perspective
    display_name: str
    character_key: str | None
    status: str
    requested_by_me: bool
    created_at: datetime
    accepted_at: datetime | None


@dataclass(slots=True, frozen=True)
class FriendFocusingNow:
    user_id: str
    display_name: str
    character_key: str | None
    session_id: str
    started_at: datetime
    minutes_planned: int | None


@dataclass(slots=True, frozen=True)
class FriendSearchResult:
    """One row of a user-search hit, with the current friendship state
    relative to the viewer so the FE can render the right CTA
    (Add / Pending / Accept / Already friends) without a follow-up call.
    """

    user_id: str
    display_name: str
    character_key: str | None
    friendship_status: str  # "none" | "requested" | "accepted" | "blocked"
    friendship_id: str | None
    requested_by_me: bool


class FriendshipService:
    """Friend graph CRUD + WS fan-out.

    SOLID notes:
      • SRP — only models friendship state transitions + ID-side mapping;
        does not own the FriendsView UI or presence cache.
      • DIP — depends on Protocols (IFriendshipRepo, IUserRepo,
        IFocusSessionRepo, IRealtimePublisher, IIdGenerator, IClock). No
        SQL imports — testable with fakes.
      • OCP — adding a "blocked" state branch only needs new methods +
        a new status string; existing happy-path code is closed.

    Realtime: every state transition is published to **both** users via
    `user:{id}` channels so each side's friendsStore can react without
    polling. Payload carries the friendship row + the *other* user's
    public summary so the FE can render instantly.
    """

    def __init__(
        self,
        *,
        friendships: IFriendshipRepo,
        users: IUserRepo,
        focus_sessions: IFocusSessionRepo,
        publisher: IRealtimePublisher | None,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._friendships = friendships
        self._users = users
        self._sessions = focus_sessions
        self._pub = publisher
        self._ids = ids
        self._clock = clock

    # ── commands ──────────────────────────────────────────────────────

    async def request(
        self, *, requester_id: str, target_id: str
    ) -> Friendship:
        if requester_id == target_id:
            raise ValidationError("cannot_friend_self")
        target = await self._users.get_by_id(target_id)
        if target is None:
            raise NotFoundError("target_user_not_found")

        existing = await self._friendships.get_between(requester_id, target_id)
        if existing is not None:
            if existing.status == STATUS_BLOCKED:
                raise ForbiddenError("friendship_blocked")
            if existing.status == STATUS_ACCEPTED:
                raise ConflictError("already_friends")
            # Pending: if the *other* side opened it earlier, auto-accept
            # this counter-request — a deliberate UX nicety.
            if existing.requested_by != requester_id:
                return await self._accept_internal(existing)
            return existing

        row = await self._friendships.create_request(
            friendship_id=self._ids.new_id(),
            requester_id=requester_id,
            target_id=target_id,
        )
        await self._publish_event("friend.requested", row, viewer_id=target_id)
        return row

    async def accept(
        self, *, friendship_id: str, accepter_id: str
    ) -> Friendship:
        row = await self._get_for_user(friendship_id, accepter_id)
        if row.status != STATUS_REQUESTED:
            raise ValidationError("friendship_not_pending")
        if row.requested_by == accepter_id:
            raise ForbiddenError("cannot_accept_own_request")
        return await self._accept_internal(row)

    async def reject(
        self, *, friendship_id: str, rejecter_id: str
    ) -> None:
        row = await self._get_for_user(friendship_id, rejecter_id)
        if row.status != STATUS_REQUESTED:
            raise ValidationError("friendship_not_pending")
        await self._friendships.delete(row.id)
        await self._publish_event(
            "friend.rejected", row, viewer_id=row.requested_by
        )

    async def unfriend(
        self, *, friendship_id: str, actor_id: str
    ) -> None:
        row = await self._get_for_user(friendship_id, actor_id)
        if row.status != STATUS_ACCEPTED:
            raise ValidationError("friendship_not_accepted")
        await self._friendships.delete(row.id)
        # Notify the *other* side. The actor's own UI can simply drop
        # the row on the optimistic path.
        other = _other_side(row, actor_id)
        await self._publish_event("friend.removed", row, viewer_id=other)

    # ── queries ───────────────────────────────────────────────────────

    async def list_friends(
        self,
        *,
        user_id: str,
        status: str = STATUS_ACCEPTED,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[FriendSummary]:
        rows = await self._friendships.list_for_user(
            user_id, status=status, cursor=cursor, limit=limit
        )
        other_ids = [_other_side(r, user_id) for r in rows]
        users = await self._users.get_many_by_ids(other_ids) if other_ids else []
        users_by_id = {u.id: u for u in users}
        out: list[FriendSummary] = []
        for r in rows:
            other_id = _other_side(r, user_id)
            u = users_by_id.get(other_id)
            if u is None:
                continue
            out.append(
                FriendSummary(
                    friendship_id=r.id,
                    user_id=other_id,
                    display_name=u.display_name,
                    character_key=u.character_key,
                    status=r.status,
                    requested_by_me=(r.requested_by == user_id),
                    created_at=r.created_at,
                    accepted_at=r.accepted_at,
                )
            )
        return out

    async def search_users(
        self, *, viewer_id: str, query: str
    ) -> list[FriendSearchResult]:
        """v1: UUID-exact match only.

        Why not display-name substring: anonymous name search is an
        enumeration vector (anyone authenticated could harvest the user
        directory). The product's primary discovery flow is the deep
        link, so name search is deferred until a separate ``handle``
        identifier exists. See plan: docs/plans/...todo-md-modular-quokka
        Open Question 1.
        """
        q = query.strip()
        if not q or q == viewer_id:
            return []
        target = await self._users.get_by_id(q)
        if target is None:
            return []
        existing = await self._friendships.get_between(viewer_id, target.id)
        if existing is None:
            status = "none"
            friendship_id: str | None = None
            requested_by_me = False
        else:
            status = existing.status
            friendship_id = existing.id
            requested_by_me = existing.requested_by == viewer_id
        return [
            FriendSearchResult(
                user_id=target.id,
                display_name=target.display_name,
                character_key=target.character_key,
                friendship_status=status,
                friendship_id=friendship_id,
                requested_by_me=requested_by_me,
            )
        ]

    async def list_focusing_now(
        self, *, user_id: str
    ) -> list[FriendFocusingNow]:
        friend_ids = await self._friendships.list_accepted_friend_ids(user_id)
        if not friend_ids:
            return []
        friend_id_set = set(friend_ids)
        # list_active() returns a small set (active sessions only) —
        # filtering in-process is the cheapest path for MVP scale and
        # avoids an extra repo Protocol method.
        active = await self._sessions.list_active()
        relevant = [s for s in active if s.user_id in friend_id_set]
        if not relevant:
            return []
        users = await self._users.get_many_by_ids(
            [s.user_id for s in relevant]
        )
        users_by_id = {u.id: u for u in users}
        out: list[FriendFocusingNow] = []
        for s in relevant:
            u = users_by_id.get(s.user_id)
            if u is None:
                continue
            out.append(
                FriendFocusingNow(
                    user_id=s.user_id,
                    display_name=u.display_name,
                    character_key=u.character_key,
                    session_id=s.id,
                    started_at=s.started_at,
                    minutes_planned=getattr(s, "minutes_planned", None),
                )
            )
        return out

    # ── internals ─────────────────────────────────────────────────────

    async def _get_for_user(
        self, friendship_id: str, viewer_id: str
    ) -> Friendship:
        # We don't have a direct "get by id" on the repo (avoiding a
        # tiny extra method when get_between already covers the access
        # pattern). Re-derive: pull the viewer's friendships and find
        # the matching id. This is O(N) on the user's friend list which
        # is bounded by realistic UX limits (~200).
        rows = await self._friendships.list_for_user(viewer_id, limit=500)
        for r in rows:
            if r.id == friendship_id:
                return r
        raise NotFoundError("friendship_not_found")

    async def _accept_internal(self, row: Friendship) -> Friendship:
        accepted_at = self._clock.now()
        if accepted_at.tzinfo is None:
            accepted_at = accepted_at.replace(tzinfo=UTC)
        updated = await self._friendships.update_status(
            row.id,
            status=STATUS_ACCEPTED,
            accepted_at=accepted_at,
        )
        if updated is None:
            raise BusinessError("friendship_update_failed")
        # Both sides get the accept event for live UI refresh.
        await self._publish_event(
            "friend.accepted", updated, viewer_id=updated.user_low_id
        )
        await self._publish_event(
            "friend.accepted", updated, viewer_id=updated.user_high_id
        )
        return updated

    async def _publish_event(
        self, kind: str, row: Friendship, *, viewer_id: str
    ) -> None:
        if self._pub is None:
            return
        payload: dict[str, Any] = {
            "type": kind,
            "friendship_id": row.id,
            "status": row.status,
            "requested_by": row.requested_by,
            "other_user_id": _other_side(row, viewer_id),
        }
        await self._pub.publish(
            IRealtimePublisher.user_channel(viewer_id), payload
        )


def _other_side(row: Friendship, self_id: str) -> str:
    return row.user_high_id if row.user_low_id == self_id else row.user_low_id
