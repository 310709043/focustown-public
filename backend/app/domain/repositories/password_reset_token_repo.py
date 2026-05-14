from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True)
class ResetTokenRecord:
    id: str
    user_id: str
    token_hash: str
    expires_at: datetime
    consumed_at: datetime | None
    created_at: datetime


class IPasswordResetTokenRepo(Protocol):
    async def create(
        self,
        *,
        token_id: str,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
        requested_ip: str | None,
    ) -> None: ...

    async def find_active_by_hash(self, token_hash: str) -> ResetTokenRecord | None: ...

    async def mark_consumed(self, token_id: str, *, at: datetime) -> None: ...

    async def invalidate_active_for_user(self, user_id: str, *, at: datetime) -> None: ...
