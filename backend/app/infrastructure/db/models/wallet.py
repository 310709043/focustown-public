from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class WalletORM(Base, IdMixin, TimestampMixin):
    """A user's balance in one currency.

    A user can hold multiple wallets (one per currency); the platform-native
    T (Town Coin) is created lazily on first credit. Phase 10 wires up TWD
    via Visa-backed top-ups.
    """

    __tablename__ = "user_wallets"
    __table_args__ = (
        UniqueConstraint("user_id", "currency_code", name="uq_user_wallets_user_currency"),
        CheckConstraint("balance_minor >= 0", name="ck_user_wallets_nonneg"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False)
    balance_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
