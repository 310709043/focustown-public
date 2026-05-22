from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Integer, case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import IdempotencyViolationError, NotFoundError
from app.core.pagination import apply_keyset
from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus
from app.domain.repositories.focus_session_repo import (
    IFocusSessionRepo,
    UserFocusTotals,
)
from app.infrastructure.db.models.focus_session import FocusSessionORM


def _to_domain(row: FocusSessionORM) -> FocusSession:
    return FocusSession(
        id=row.id,
        user_id=row.user_id,
        partner_user_id=row.partner_user_id,
        mode=FocusSessionMode(row.mode),
        duration_seconds=row.duration_seconds,
        elapsed_seconds=row.elapsed_seconds,
        status=FocusSessionStatus(row.status),
        task_label=row.task_label,
        started_at=row.started_at,
        ended_at=row.ended_at,
    )


class SqlFocusSessionRepo(IFocusSessionRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(
        self,
        *,
        session_id: str,
        user_id: str,
        mode: FocusSessionMode,
        duration_seconds: int,
        task_label: str | None,
        partner_user_id: str | None,
        started_at: datetime,
        idempotency_key: str | None = None,
        idempotency_body_hash: str | None = None,
    ) -> FocusSession:
        row = FocusSessionORM(
            id=session_id,
            user_id=user_id,
            partner_user_id=partner_user_id,
            mode=mode.value,
            duration_seconds=duration_seconds,
            elapsed_seconds=0,
            status=FocusSessionStatus.ACTIVE.value,
            task_label=task_label,
            started_at=started_at,
            idempotency_key=idempotency_key,
            idempotency_body_hash=idempotency_body_hash,
        )
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as exc:
            # Partial unique index ux_focus_sessions_idem trips when a
            # concurrent POST with the same (user_id, idempotency_key) just
            # committed. Surface as a domain-level idempotency signal — the
            # service decides whether to translate to a 200 (same body) or
            # 409 (different body).
            if idempotency_key is None:
                raise
            raise IdempotencyViolationError("focus_session_idem_conflict") from exc
        return _to_domain(row)

    async def get(self, session_id: str) -> FocusSession | None:
        row = await self._s.get(FocusSessionORM, session_id)
        return _to_domain(row) if row else None

    async def get_by_user_and_idem(
        self, *, user_id: str, idempotency_key: str
    ) -> tuple[FocusSession, str | None] | None:
        # ``with_for_update(skip_locked=True)`` is intentional: a concurrent
        # writer that holds the row lock (mid-INSERT-then-flush from a
        # parallel POST with the same key) is skipped here, which lets us
        # fall through to the INSERT and rely on the partial unique index
        # to serialise. Without SKIP LOCKED the second caller would block on
        # the first and we'd lose the chance to fast-return.
        stmt = (
            select(FocusSessionORM)
            .where(
                FocusSessionORM.user_id == user_id,
                FocusSessionORM.idempotency_key == idempotency_key,
            )
            .with_for_update(skip_locked=True)
        )
        row = (await self._s.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None
        return _to_domain(row), row.idempotency_body_hash

    async def update_status(
        self,
        *,
        session_id: str,
        status: FocusSessionStatus,
        elapsed_seconds: int,
        ended_at: datetime | None,
    ) -> FocusSession:
        # SQL-level guard against the race between /complete (or /cancel)
        # and the worker's sweep_abandoned pass: terminal transitions are
        # only persisted when the row is still `active`. If a competing
        # writer flipped the status in the same second, the UPDATE affects
        # zero rows and we raise NotFoundError — the caller (service) treats
        # that as "someone else terminated it first" and skips its event so
        # achievement / coin handlers don't double-fire.
        stmt = (
            update(FocusSessionORM)
            .where(
                FocusSessionORM.id == session_id,
                FocusSessionORM.status == FocusSessionStatus.ACTIVE.value,
            )
            .values(
                status=status.value,
                elapsed_seconds=elapsed_seconds,
                ended_at=ended_at,
            )
            .returning(FocusSessionORM)
        )
        result = await self._s.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            raise NotFoundError("focus_session_not_active")
        await self._s.flush()
        return _to_domain(row)

    async def list_active(
        self,
        *,
        cursor: str | None = None,
        limit: int = 200,
    ) -> list[FocusSession]:
        stmt = select(FocusSessionORM).where(
            FocusSessionORM.status == FocusSessionStatus.ACTIVE.value
        )
        stmt = apply_keyset(
            stmt,
            ts_col=FocusSessionORM.started_at,
            id_col=FocusSessionORM.id,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            FocusSessionORM.started_at.desc(), FocusSessionORM.id.desc()
        ).limit(limit + 1)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_by_user_since(
        self,
        *,
        user_id: str,
        since: datetime,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[FocusSession]:
        stmt = select(FocusSessionORM).where(
            FocusSessionORM.user_id == user_id, FocusSessionORM.started_at >= since
        )
        stmt = apply_keyset(
            stmt,
            ts_col=FocusSessionORM.started_at,
            id_col=FocusSessionORM.id,
            cursor=cursor,
        )
        stmt = stmt.order_by(
            FocusSessionORM.started_at.desc(), FocusSessionORM.id.desc()
        ).limit(limit + 1)
        rows = (await self._s.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def count_completed_today(self, *, user_id: str, day_start: datetime) -> int:
        stmt = select(func.count()).select_from(FocusSessionORM).where(
            FocusSessionORM.user_id == user_id,
            FocusSessionORM.status == FocusSessionStatus.COMPLETED.value,
            FocusSessionORM.mode == FocusSessionMode.FOCUS.value,
            FocusSessionORM.started_at >= day_start,
        )
        return int((await self._s.execute(stmt)).scalar_one())

    async def daily_leaderboard(
        self, *, day_start: datetime, limit: int
    ) -> list[tuple[str, int]]:
        stmt = (
            select(FocusSessionORM.user_id, func.count().label("c"))
            .where(
                FocusSessionORM.status == FocusSessionStatus.COMPLETED.value,
                FocusSessionORM.mode == FocusSessionMode.FOCUS.value,
                FocusSessionORM.started_at >= day_start,
            )
            .group_by(FocusSessionORM.user_id)
            .order_by(func.count().desc())
            .limit(limit)
        )
        return [(uid, int(c)) for uid, c in (await self._s.execute(stmt)).all()]

    async def user_totals(
        self, *, user_id: str, week_start: datetime
    ) -> UserFocusTotals:
        # Single round-trip: lifetime count, lifetime elapsed-seconds, and
        # week-to-date elapsed-seconds rolled up via conditional aggregates.
        completed = FocusSessionStatus.COMPLETED.value
        focus_mode = FocusSessionMode.FOCUS.value
        stmt = select(
            func.count().label("lifetime_count"),
            func.coalesce(func.sum(FocusSessionORM.elapsed_seconds), 0).label(
                "lifetime_seconds"
            ),
            func.coalesce(
                func.sum(
                    case(
                        (FocusSessionORM.started_at >= week_start, FocusSessionORM.elapsed_seconds),
                        else_=0,
                    )
                ),
                0,
            ).label("week_seconds"),
        ).where(
            FocusSessionORM.user_id == user_id,
            FocusSessionORM.status == completed,
            FocusSessionORM.mode == focus_mode,
        )
        row = (await self._s.execute(stmt)).one()
        return UserFocusTotals(
            completed_focus_count=int(row.lifetime_count or 0),
            completed_focus_seconds=int(row.lifetime_seconds or 0),
            week_focus_seconds=int(row.week_seconds or 0),
        )

    async def completed_focus_days_since(
        self, *, user_id: str, since: datetime
    ) -> list[datetime]:
        # Use func.date() to bucket by UTC calendar day; the service layer
        # interprets results in whatever timezone the user is in (defaults
        # to UTC for now). Cast to a python datetime list of midnight UTC
        # values for downstream calendar math.
        day_col = func.date(FocusSessionORM.started_at).label("day")
        stmt = (
            select(day_col)
            .where(
                FocusSessionORM.user_id == user_id,
                FocusSessionORM.status == FocusSessionStatus.COMPLETED.value,
                FocusSessionORM.mode == FocusSessionMode.FOCUS.value,
                FocusSessionORM.started_at >= since,
            )
            .group_by(day_col)
            .order_by(day_col.desc())
        )
        rows = (await self._s.execute(stmt)).all()
        out: list[datetime] = []
        for (day,) in rows:
            if day is None:
                continue
            # SQLite returns str; Postgres returns date — normalize to
            # midnight UTC datetime so the caller can do timezone-aware
            # day-diff arithmetic.
            if isinstance(day, str):
                parsed = datetime.fromisoformat(day)
            elif isinstance(day, datetime):
                parsed = day
            else:
                # python date — promote to datetime at midnight
                parsed = datetime(day.year, day.month, day.day)
            out.append(parsed.replace(tzinfo=UTC))
        return out

    async def weekly_rank(
        self, *, user_id: str, week_start: datetime
    ) -> int:
        # Rank by descending count, ties share the same rank (dense rank
        # would let everyone climb 1 spot at a tie; we prefer competition
        # ranking — 1, 2, 2, 4). Users with zero completions this week
        # don't appear in the GROUP BY result; service translates that to
        # rank 0 (frontend renders "—").
        sub = (
            select(
                FocusSessionORM.user_id.label("user_id"),
                func.count().label("c"),
            )
            .where(
                FocusSessionORM.status == FocusSessionStatus.COMPLETED.value,
                FocusSessionORM.mode == FocusSessionMode.FOCUS.value,
                FocusSessionORM.started_at >= week_start,
            )
            .group_by(FocusSessionORM.user_id)
            .subquery()
        )
        my_count_stmt = select(sub.c.c).where(sub.c.user_id == user_id)
        my_count = (await self._s.execute(my_count_stmt)).scalar_one_or_none()
        if my_count is None or my_count == 0:
            return 0
        ahead_stmt = select(func.count()).select_from(sub).where(sub.c.c > my_count)
        ahead = int((await self._s.execute(ahead_stmt)).scalar_one())
        return ahead + 1

    async def weekly_heatmap(
        self, *, user_id: str, week_start: datetime
    ) -> list[list[int]]:
        # Group by (Monday-based DOW, hour). Postgres' extract(dow ...)
        # returns 0..6 with Sunday=0, so we shift by -1 mod 7 to make
        # Monday=0. SQLite (tests) needs strftime fallback.
        dialect = self._s.bind.dialect.name if self._s.bind is not None else ""
        if dialect == "postgresql":
            dow = ((func.extract("dow", FocusSessionORM.started_at) + 6) % 7).label(
                "dow"
            )
            hour = func.extract("hour", FocusSessionORM.started_at).label("hour")
        else:
            # SQLite + others: strftime returns 0-Sunday too. Cast to int.
            dow = (
                (
                    func.cast(
                        func.strftime("%w", FocusSessionORM.started_at),
                        Integer,
                    )
                    + 6
                )
                % 7
            ).label("dow")
            hour = func.cast(
                func.strftime("%H", FocusSessionORM.started_at),
                Integer,
            ).label("hour")
        stmt = (
            select(dow, hour, func.count().label("c"))
            .where(
                FocusSessionORM.user_id == user_id,
                FocusSessionORM.status == FocusSessionStatus.COMPLETED.value,
                FocusSessionORM.mode == FocusSessionMode.FOCUS.value,
                FocusSessionORM.started_at >= week_start,
            )
            .group_by(dow, hour)
        )
        grid: list[list[int]] = [[0 for _ in range(24)] for _ in range(7)]
        rows = (await self._s.execute(stmt)).all()
        if not rows:
            return grid
        # Normalize raw counts to a 0..4 intensity scale based on the
        # week's busiest cell so the visual never looks empty when the
        # user *does* have data, but stays all-zero when they don't.
        counts = [(int(d), int(h), int(c)) for d, h, c in rows]
        peak = max(c for _, _, c in counts)
        for d, h, c in counts:
            if not (0 <= d <= 6 and 0 <= h <= 23):
                continue
            intensity = min(4, round(c / peak * 4)) if peak > 0 else 0
            grid[d][h] = max(grid[d][h], intensity)
        return grid
