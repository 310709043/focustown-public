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


class IUserItemReader(Protocol):
    """Read-only view over user_items.

    Services that only check ownership (e.g. ``EquipmentService``) or
    resolve an inventory row (e.g. ``RoomDecorationService.place``) should
    depend on this Protocol so they cannot accidentally mutate inventory.
    """

    async def list_for_user(self, user_id: str) -> list[UserItem]: ...
    async def owns(self, *, user_id: str, shop_item_id: str) -> bool: ...
    async def get_by_id_and_owner(
        self, *, user_item_id: str, owner_user_id: str
    ) -> UserItem | None: ...


class IUserItemWriter(Protocol):
    """Write-side over user_items (grant ownership rows)."""

    async def insert(
        self,
        *,
        item_id: str,
        user_id: str,
        shop_item_id: str,
        acquired_via: str,
        wallet_transaction_id: str | None,
    ) -> UserItem:
        """Insert a user→item ownership row.

        Raises ``IdempotencyViolationError`` if the user already owns
        ``shop_item_id`` (UNIQUE constraint). Adapter implementations are
        responsible for translating their storage-native uniqueness
        exception (e.g. SQL ``IntegrityError``) into the domain exception.
        Callers (e.g. ``PurchaseService``) translate that into
        ``ConflictError("already_owned")``.
        """


class IUserItemRepo(IUserItemReader, IUserItemWriter, Protocol):
    """Full user_items repository — composes reader + writer.

    Callers that genuinely need both sides depend on this; everything
    else should narrow to ``IUserItemReader`` or ``IUserItemWriter`` per
    Interface Segregation (mirrors the ``IUserRepo`` split in
    user_repo.py).
    """
