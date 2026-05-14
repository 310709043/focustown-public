from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class ShopItemORM(Base, IdMixin, TimestampMixin):
    __tablename__ = "shop_items"

    # car|scene|effect|sub
    category: Mapped[str] = mapped_column(
        String(32), index=True, nullable=False
    )
    icon: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Phase 3 — visual attrs per category (vehicles use icon/body_color/roof_color).
    # JSONB so scene / effect items can declare their own shape later.
    render_meta: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
