"""Note CRUD + match-shared scoping.

SOLID:
- S: only orchestrates note CRUD + match-membership auth. Catalog of
  notes / match rows are accessed through their own repos.
- O: a new "shared scope" (e.g. shared-with-team) can be added as a
  second optional kwarg without changing the existing signatures.
- L: ``INoteRepo`` / ``IMatchRepo`` fakes used in unit tests fully
  satisfy the Protocols; service is framework-free.
- I: depends on two narrow Protocols, never on a mega-port.
- D: no FastAPI / SQLAlchemy imports in this module.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.ids import IIdGenerator
from app.core.sentinels import UNSET, UnsetType
from app.domain.repositories.match_repo import IMatchRepo
from app.domain.repositories.note_repo import INoteRepo, NoteRecord


@dataclass(slots=True)
class NoteService:
    notes: INoteRepo
    matches: IMatchRepo
    ids: IIdGenerator

    async def list_for_user(
        self,
        *,
        user_id: str,
        match_id: str | None = None,
    ) -> list[NoteRecord]:
        """Owner's notes — and, if ``match_id`` is given and the
        requester is a member of that match, also the notes shared
        into the match.
        """
        if match_id is not None:
            await self._require_match_member(user_id=user_id, match_id=match_id)
            return await self.notes.list_for_user(
                user_id, include_shared_in_match_id=match_id
            )
        return await self.notes.list_for_user(user_id)

    async def create(
        self,
        *,
        user_id: str,
        title: str,
        body: str,
        shared_in_match_id: str | None = None,
    ) -> NoteRecord:
        if shared_in_match_id is not None:
            await self._require_match_member(
                user_id=user_id, match_id=shared_in_match_id
            )
        return await self.notes.create(
            note_id=self.ids.new_id(),
            user_id=user_id,
            title=title,
            body=body,
            shared_in_match_id=shared_in_match_id,
        )

    async def update(
        self,
        *,
        user_id: str,
        note_id: str,
        title: str | None = None,
        body: str | None = None,
        done: bool | None = None,
        shared_in_match_id: str | None | UnsetType = UNSET,
    ) -> NoteRecord:
        if (
            not isinstance(shared_in_match_id, UnsetType)
            and shared_in_match_id is not None
        ):
            await self._require_match_member(
                user_id=user_id, match_id=shared_in_match_id
            )
        return await self.notes.update(
            note_id=note_id,
            user_id=user_id,
            title=title,
            body=body,
            done=done,
            shared_in_match_id=shared_in_match_id,
        )

    async def delete(self, *, user_id: str, note_id: str) -> None:
        await self.notes.delete(note_id=note_id, user_id=user_id)

    async def _require_match_member(self, *, user_id: str, match_id: str) -> None:
        match = await self.matches.get(match_id)
        if match is None:
            raise NotFoundError("match_not_found")
        if user_id not in (match.requester_id, match.candidate_id):
            raise ForbiddenError("not_match_member")
