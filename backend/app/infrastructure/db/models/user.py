from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class UserORM(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Identity sub from the external auth provider (Cognito). NULL when the
    # user signed up via local_jwt and has no Cognito identity. UNIQUE so
    # verify_access_token can look up internal user id by sub in O(1).
    cognito_sub: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    character_key: Mapped[str | None] = mapped_column(String(32), nullable=True)
    role_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_bot: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, index=True
    )
    terms_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    terms_version: Mapped[str | None] = mapped_column(String(16), nullable=True)
    marketing_opt_in: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    marketing_opt_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Phase 3 — equipment pointers (FK→shop_items, ON DELETE SET NULL so an
    # item being retired doesn't lock the user record). avatar slot is
    # forward-declared; no UI in Phase 3 yet.
    equipped_vehicle_item_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("shop_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    equipped_avatar_item_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("shop_items.id", ondelete="SET NULL"),
        nullable=True,
    )
