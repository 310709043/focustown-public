from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.core.sentinels import UNSET, UnsetType


@dataclass(slots=True)
class NoteRecord:
    id: str
    user_id: str
    title: str
    body: str
    done: bool
    created_at: datetime
    updated_at: datetime
    shared_in_match_id: str | None = None


class INoteRepo(Protocol):
    async def list_for_user(
        self,
        user_id: str,
        *,
        include_shared_in_match_id: str | None = None,
    ) -> list[NoteRecord]:
        """Return ``user_id``'s notes.

        If ``include_shared_in_match_id`` is provided, also include
        notes (owned by anyone) whose ``shared_in_match_id`` matches —
        the matched-focus-room shared notepad. Auth is the caller's
        responsibility: this repo trusts that the requester is a
        member of the match.
        """
        ...

    async def get(self, note_id: str) -> NoteRecord | None: ...

    async def create(
        self,
        *,
        note_id: str,
        user_id: str,
        title: str,
        body: str,
        shared_in_match_id: str | None = None,
    ) -> NoteRecord: ...

    async def update(
        self,
        *,
        note_id: str,
        user_id: str,
        title: str | None = None,
        body: str | None = None,
        done: bool | None = None,
        shared_in_match_id: str | None | UnsetType = UNSET,
    ) -> NoteRecord: ...

    async def delete(self, *, note_id: str, user_id: str) -> None: ...
