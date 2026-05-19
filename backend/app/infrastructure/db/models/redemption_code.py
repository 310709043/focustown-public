from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class RedemptionCodeORM(Base, IdMixin, TimestampMixin):
    """A single redeemable code grant. The same code can be used by many
    users until ``max_uses`` is reached (NULL = unlimited within window)."""

    __tablename__ = "redemption_codes"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="redemption_codes_amount_positive"),
    )

    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uses_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    valid_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class RedemptionCodeUseORM(Base, IdMixin, TimestampMixin):
    """One row per (code, user). Idempotency boundary for the redeem
    operation — re-attempting a redeem trips the UNIQUE constraint."""

    __tablename__ = "redemption_code_uses"
    __table_args__ = (
        UniqueConstraint(
            "code_id", "user_id", name="uq_redemption_code_uses_code_id_user_id"
        ),
    )

    code_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("redemption_codes.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
