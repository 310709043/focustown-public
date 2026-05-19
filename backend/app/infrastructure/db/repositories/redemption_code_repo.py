from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import IdempotencyViolationError
from app.domain.repositories.redemption_code_repo import (
    IRedemptionCodeRepo,
    RedemptionCode,
)
from app.infrastructure.db.models.redemption_code import (
    RedemptionCodeORM,
    RedemptionCodeUseORM,
)

_UNIQUE_USE_CONSTRAINT = "uq_redemption_code_uses_code_id_user_id"


def _to_domain(row: RedemptionCodeORM) -> RedemptionCode:
    return RedemptionCode(
        id=row.id,
        code=row.code,
        currency_code=row.currency_code,
        amount_minor=row.amount_minor,
        max_uses=row.max_uses,
        uses_count=row.uses_count,
        valid_from=row.valid_from,
        valid_until=row.valid_until,
        is_active=row.is_active,
        metadata=row.meta,
    )


class SqlRedemptionCodeRepo(IRedemptionCodeRepo):
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_by_code(self, code: str) -> RedemptionCode | None:
        row = (
            await self._s.execute(
                select(RedemptionCodeORM).where(RedemptionCodeORM.code == code)
            )
        ).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def get_by_code_for_update(self, code: str) -> RedemptionCode | None:
        row = (
            await self._s.execute(
                select(RedemptionCodeORM)
                .where(RedemptionCodeORM.code == code)
                .with_for_update()
            )
        ).scalar_one_or_none()
        return _to_domain(row) if row else None

    async def record_use(
        self,
        *,
        use_id: str,
        code_id: str,
        user_id: str,
    ) -> None:
        row = RedemptionCodeUseORM(id=use_id, code_id=code_id, user_id=user_id)
        self._s.add(row)
        try:
            await self._s.flush()
        except IntegrityError as exc:
            msg = str(exc.orig) if exc.orig is not None else str(exc)
            if _UNIQUE_USE_CONSTRAINT in msg:
                raise IdempotencyViolationError(
                    "redemption_already_used"
                ) from exc
            raise

    async def increment_uses(self, code_id: str) -> int:
        result = await self._s.execute(
            update(RedemptionCodeORM)
            .where(RedemptionCodeORM.id == code_id)
            .values(uses_count=RedemptionCodeORM.uses_count + 1)
            .returning(RedemptionCodeORM.uses_count)
        )
        new_count = result.scalar_one()
        return int(new_count)
