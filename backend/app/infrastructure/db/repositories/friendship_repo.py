from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import apply_keyset
from app.domain.repositories.friendship_repo import Friendship, IFriendshipRepo
from app.infrastructure.db.models.friendship import FriendshipORM


def _order_pair(a: str, b: str) -> tuple[str, str]:
    """Deterministic (low, high) ordering for the pair invariant."""
    return (a, b) if a < b else (b, a)


def _to_domain(row: FriendshipORM) -> Friendship:
    return Friendship(
        id=row.id,
        user_low_id=row.user_low_id,
        user_high_id=row.user_high_id,
        status=row.status,
        requested_by=row.requested_by,
        created_at=row.created_at,
        accepted_at=row.accepted_at,
    )


class SqlFriendshipRepo(IFriendshipRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_between(
        self, user_a_id: str, user_b_id: str
    ) -> Friendship | None:
        low, high = _order_pair(user_a_id, user_b_id)
        row = (
            await self._s.execute(
                select(FriendshipORM).where(
                    FriendshipORM.user_low_id == low,
                    FriendshipORM.user_high_id == high,
                )
            )
        ).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def list_for_user(
        self,
        user_id: str,
        *,
        status: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[Friendship]:
        clause = or_(
            FriendshipORM.user_low_id == user_id,
            FriendshipORM.user_high_id == user_id,
        )
        stmt = select(FriendshipORM).where(clause)
        if status:
            stmt = stmt.where(FriendshipORM.status == status)
        stmt = apply_keyset(
            stmt,
            ts_col=FriendshipORM.created_at,
            id_col=FriendshipORM.id,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            FriendshipORM.created_at.desc(), FriendshipORM.id.desc()
        ).limit(limit + 1)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_incoming_requests(
        self,
        user_id: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[Friendship]:
        clause = and_(
            or_(
                FriendshipORM.user_low_id == user_id,
                FriendshipORM.user_high_id == user_id,
            ),
            FriendshipORM.status == "requested",
            FriendshipORM.requested_by != user_id,
        )
        stmt = select(FriendshipORM).where(clause)
        stmt = apply_keyset(
            stmt,
            ts_col=FriendshipORM.created_at,
            id_col=FriendshipORM.id,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            FriendshipORM.created_at.desc(), FriendshipORM.id.desc()
        ).limit(limit + 1)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_accepted_friend_ids(self, user_id: str) -> list[str]:
        stmt = select(
            FriendshipORM.user_low_id, FriendshipORM.user_high_id
        ).where(
            and_(
                or_(
                    FriendshipORM.user_low_id == user_id,
                    FriendshipORM.user_high_id == user_id,
                ),
                FriendshipORM.status == "accepted",
            )
        )
        rows = (await self._s.execute(stmt)).all()
        return [(high if low == user_id else low) for low, high in rows]

    async def create_request(
        self,
        *,
        friendship_id: str,
        requester_id: str,
        target_id: str,
    ) -> Friendship:
        # Idempotent on the (user_low_id, user_high_id) unique pair. The
        # service layer's request() already detects existing rows via
        # get_between(); this repo guard catches the race window where two
        # concurrent requests slip past that check. Previously an
        # IntegrityError bubbled to a 500 (or noisy 409); now both callers
        # see the canonical row.
        low, high = _order_pair(requester_id, target_id)
        stmt = (
            pg_insert(FriendshipORM)
            .values(
                id=friendship_id,
                user_low_id=low,
                user_high_id=high,
                status="requested",
                requested_by=requester_id,
            )
            .on_conflict_do_nothing(
                index_elements=["user_low_id", "user_high_id"]
            )
        )
        await self._s.execute(stmt)
        existing = await self.get_between(requester_id, target_id)
        assert existing is not None  # INSERT-or-skip guarantees a row exists
        return existing

    async def update_status(
        self,
        friendship_id: str,
        *,
        status: str,
        accepted_at: datetime | None = None,
    ) -> Friendship | None:
        values: dict[str, object] = {"status": status}
        if accepted_at is not None:
            values["accepted_at"] = accepted_at
        await self._s.execute(
            update(FriendshipORM)
            .where(FriendshipORM.id == friendship_id)
            .values(**values)
        )
        await self._s.flush()
        row = await self._s.get(FriendshipORM, friendship_id)
        return _to_domain(row) if row else None

    async def delete(self, friendship_id: str) -> None:
        await self._s.execute(
            delete(FriendshipORM).where(FriendshipORM.id == friendship_id)
        )
        await self._s.flush()
