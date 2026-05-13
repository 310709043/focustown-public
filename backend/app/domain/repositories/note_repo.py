from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(slots=True)
class NoteRecord:
    id: str
    user_id: str
    title: str
    body: str
    done: bool
    created_at: datetime
    updated_at: datetime


class INoteRepo(Protocol):
    async def list_for_user(self, user_id: str) -> list[NoteRecord]: ...
    async def create(
        self, *, note_id: str, user_id: str, title: str, body: str
    ) -> NoteRecord: ...
    async def update(
        self,
        *,
        note_id: str,
        user_id: str,
        title: str | None = None,
        body: str | None = None,
        done: bool | None = None,
    ) -> NoteRecord: ...
    async def delete(self, *, note_id: str, user_id: str) -> None: ...
