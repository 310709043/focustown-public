from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(slots=True, frozen=True)
class MatchMessage:
    id: str
    match_id: str
    sender_id: str
    kind: str
    body: str
    metadata: dict[str, Any] | None
    created_at: datetime


@dataclass(slots=True, frozen=True)
class MatchAgendaItem:
    id: str
    match_id: str
    position: int
    body: str
    status: str
    created_by: str
    checked_by: str | None
    checked_at: datetime | None
    created_at: datetime
    updated_at: datetime


class IMatchMessageRepo(Protocol):
    async def list_by_match(
        self,
        match_id: str,
        *,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[MatchMessage]:
        """Reverse-chronological scrollback paginated by ``(created_at, id)``.

        The repo over-fetches by one row; routers compute ``next_cursor``
        from the overflow. Replaces the previous ``before: datetime`` shape
        — clients now hand back the opaque cursor returned by the
        previous page rather than reconstructing a timestamp.
        """

    async def create(
        self,
        *,
        message_id: str,
        match_id: str,
        sender_id: str,
        kind: str,
        body: str,
        metadata: dict[str, Any] | None,
    ) -> MatchMessage: ...


class IMatchAgendaRepo(Protocol):
    async def list_by_match(self, match_id: str) -> list[MatchAgendaItem]: ...

    async def get(self, item_id: str) -> MatchAgendaItem | None: ...

    async def create(
        self,
        *,
        item_id: str,
        match_id: str,
        position: int,
        body: str,
        created_by: str,
    ) -> MatchAgendaItem: ...

    async def update(
        self,
        item_id: str,
        *,
        body: str | None = None,
        status: str | None = None,
        position: int | None = None,
        checked_by: str | None = None,
        checked_at: datetime | None = None,
    ) -> MatchAgendaItem | None: ...

    async def delete(self, item_id: str) -> None: ...

    async def next_position(self, match_id: str) -> int: ...
