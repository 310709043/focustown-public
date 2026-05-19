from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(slots=True, frozen=True)
class RedemptionCode:
    id: str
    code: str
    currency_code: str
    amount_minor: int
    max_uses: int | None
    uses_count: int
    valid_from: datetime
    valid_until: datetime | None
    is_active: bool
    metadata: dict[str, Any] | None


class IRedemptionCodeRepo(Protocol):
    """Lookup + atomic-use bookkeeping for redeemable codes.

    The redeem operation is split into three steps the service composes:
      1. ``get_by_code`` — read the row (selectable under FOR UPDATE
         lock if the adapter supports it).
      2. ``record_use`` — insert a (code, user) row in the join table.
         The Protocol guarantees this raises ``IdempotencyViolationError``
         if the same user redeems twice; the service catches that and
         returns the appropriate domain error.
      3. ``increment_uses`` — bump the cached counter on the code row.
    """

    async def get_by_code(self, code: str) -> RedemptionCode | None: ...

    async def get_by_code_for_update(self, code: str) -> RedemptionCode | None:
        """Same as ``get_by_code`` but acquires a row lock so the
        check-then-use sequence is race-free under concurrent
        redemptions of a max-use-capped code. Adapters without
        explicit locking can alias this to ``get_by_code``."""

    async def record_use(
        self,
        *,
        use_id: str,
        code_id: str,
        user_id: str,
    ) -> None: ...

    async def increment_uses(self, code_id: str) -> int:
        """Returns the new ``uses_count``."""
