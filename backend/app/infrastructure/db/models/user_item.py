from __future__ import annotations

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class UserItemORM(Base, IdMixin, TimestampMixin):
    """A shop item owned by a user.

    UNIQUE (user_id, shop_item_id) means an item can only be purchased once;
    consumables would need a separate ``quantity`` column in a future phase.
    """

    __tablename__ = "user_items"
    __table_args__ = (
        UniqueConstraint("user_id", "shop_item_id", name="uq_user_items_user_item"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    shop_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("shop_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    acquired_via: Mapped[str] = mapped_column(String(16), nullable=False)  # purchase|grant
    wallet_transaction_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("wallet_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
