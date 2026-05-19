from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class WalletTransactionORM(Base, IdMixin, TimestampMixin):
    """Append-only ledger row.

    Every credit and debit lands here with the resulting balance, so we have
    a full audit trail decoupled from the wallet's current value. The
    partial unique index ``ux_wallet_txn_idempotent`` (created in the
    migration, not declarable here) enforces that the same (user, currency,
    reason, ref) combo can only credit/debit once — that's how
    SessionCompleted award and purchase calls become idempotent.

    ``meta`` is a JSONB blob for caller-supplied side data (gift message,
    future session sequence number, etc.). We never query inside it, so
    no GIN index is needed; column name is ``meta`` to avoid clashing
    with SQLAlchemy's reserved ``metadata`` attribute on Base.
    """

    __tablename__ = "wallet_transactions"
    __table_args__ = (
        Index(
            "ix_wallet_transactions_user_created",
            "user_id",
            "created_at",
        ),
    )

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False)
    delta_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    ref_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ref_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    balance_after_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
