from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True, frozen=True)
class Friendship:
    id: str
    user_low_id: str
    user_high_id: str
    status: str
    requested_by: str
    created_at: datetime
    accepted_at: datetime | None


class IFriendshipRepo(Protocol):
    """Single-row-per-pair friendship CRUD.

    The Protocol owns the (low, high) ordering invariant: every method
    accepts the two ids in any order and the adapter normalises them
    before talking to storage. Callers never have to sort themselves.
    """

    async def get_between(
        self, user_a_id: str, user_b_id: str
    ) -> Friendship | None: ...

    async def list_for_user(
        self,
        user_id: str,
        *,
        status: str | None = None,
        limit: int = 100,
    ) -> list[Friendship]:
        """Return all friendships where ``user_id`` is either side."""

    async def list_incoming_requests(
        self, user_id: str, *, limit: int = 100
    ) -> list[Friendship]:
        """Pending requests addressed to ``user_id`` (i.e. requested_by != user)."""

    async def list_accepted_friend_ids(self, user_id: str) -> list[str]:
        """Just the *other* user ids of accepted friendships — fast path
        for "focusing-now" type joins where we only need the id set."""

    async def create_request(
        self,
        *,
        friendship_id: str,
        requester_id: str,
        target_id: str,
    ) -> Friendship: ...

    async def update_status(
        self,
        friendship_id: str,
        *,
        status: str,
        accepted_at: datetime | None = None,
    ) -> Friendship | None: ...

    async def delete(self, friendship_id: str) -> None: ...
