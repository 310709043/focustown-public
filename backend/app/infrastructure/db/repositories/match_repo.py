from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domain.models import Match, MatchStatus
from app.domain.repositories.match_repo import IMatchRepo
from app.infrastructure.db.models.match import MatchORM


def _to_domain(row: MatchORM) -> Match:
    return Match(
        id=row.id,
        requester_id=row.requester_id,
        candidate_id=row.candidate_id,
        compatibility=row.compatibility,
        reason=row.reason,
        status=MatchStatus(row.status),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlMatchRepo(IMatchRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(
        self,
        *,
        match_id: str,
        requester_id: str,
        candidate_id: str,
        compatibility: int,
        reason: str,
    ) -> Match:
        row = MatchORM(
            id=match_id,
            requester_id=requester_id,
            candidate_id=candidate_id,
            compatibility=compatibility,
            reason=reason,
            status=MatchStatus.PENDING.value,
        )
        self._s.add(row)
        await self._s.flush()
        return _to_domain(row)

    async def get(self, match_id: str) -> Match | None:
        row = await self._s.get(MatchORM, match_id)
        return _to_domain(row) if row else None

    async def update_status(self, *, match_id: str, status: MatchStatus) -> Match:
        row = await self._s.get(MatchORM, match_id)
        if row is None:
            raise NotFoundError("match_not_found")
        row.status = status.value
        await self._s.flush()
        # ``updated_at`` is server-side ``onupdate=func.now()``; without an
        # explicit refresh, later attribute access lazy-loads it and trips
        # MissingGreenlet outside the request greenlet (e.g. when the
        # response serializer touches the domain Match's ``updated_at``).
        await self._s.refresh(row, ["updated_at"])
        return _to_domain(row)

    async def list_recent_for_user(self, *, user_id: str, limit: int) -> list[Match]:
        stmt = (
            select(MatchORM)
            .where(or_(MatchORM.requester_id == user_id, MatchORM.candidate_id == user_id))
            .order_by(MatchORM.created_at.desc())
            .limit(limit)
        )
        return [_to_domain(r) for r in (await self._s.execute(stmt)).scalars().all()]
