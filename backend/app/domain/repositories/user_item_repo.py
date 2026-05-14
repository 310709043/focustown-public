from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True, frozen=True)
class UserItem:
    id: str
    user_id: str
    shop_item_id: str
    acquired_via: str  # "purchase" | "grant"
    wallet_transaction_id: str | None
    acquired_at: datetime


class IUserItemRepo(Protocol):
    async def insert(
        self,
        *,
        item_id: str,
        user_id: str,
        shop_item_id: str,
        acquired_via: str,
        wallet_transaction_id: str | None,
    ) -> UserItem:
        """Raises the underlying ``IntegrityError`` if the user already owns
        ``shop_item_id`` (UNIQUE constraint). Callers translate that into a
        ``ConflictError("already_owned")``.
        """

    async def list_for_user(self, user_id: str) -> list[UserItem]: ...

    async def owns(self, *, user_id: str, shop_item_id: str) -> bool: ...
