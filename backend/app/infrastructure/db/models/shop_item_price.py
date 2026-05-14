from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class ShopItemPriceORM(Base, IdMixin, TimestampMixin):
    """A shop item's price in one currency.

    A given shop item can be sold in multiple currencies (e.g. T for normal
    items, TWD for FOCUS+ subscription). UNIQUE (shop_item_id, currency_code)
    means a given (item, currency) pair has exactly one row — update in
    place when adjusting price.
    """

    __tablename__ = "shop_item_prices"
    __table_args__ = (
        UniqueConstraint(
            "shop_item_id",
            "currency_code",
            name="uq_shop_item_prices_item_currency",
        ),
        CheckConstraint("amount_minor > 0", name="ck_shop_item_prices_positive"),
    )

    shop_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("shop_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
