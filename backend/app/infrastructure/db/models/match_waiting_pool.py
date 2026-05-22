from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class MatchWaitingPoolORM(Base):
    """Postgres source of truth for the matching waiting pool.

    Redis (``RedisMatchingQueue``) remains a fast secondary index for the
    sweep loop; this row is the authoritative record of "who asked to be
    matched and what happened to them". The worker boot path warms Redis
    from the rows here, and a 30s reconciliation tick repairs any drift
    introduced by a Redis crash or a partial dual-write.
    """

    __tablename__ = "match_waiting_pool"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="waiting"
    )  # waiting | paired | cancelled | bot_fallback
    enqueued_at_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    fallback_deadline_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    match_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
