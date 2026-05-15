"""Unit tests for ``NoteService`` (private + shared-in-match scope).

Coverage focus: the new match-membership auth boundary and the
private/shared partitioning. Routine CRUD is already covered by the
old direct-repo tests (kept passing because ``SqlNoteRepo`` is the
same).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.ids import IIdGenerator
from app.domain.models import Match, MatchStatus
from app.domain.repositories.note_repo import INoteRepo, NoteRecord
from app.domain.services.note_service import NoteService
from app.core.sentinels import UNSET, UnsetType
from tests.unit.fakes import FakeMatchRepo


class FakeNoteRepo(INoteRepo):
    def __init__(self) -> None:
        self.rows: dict[str, NoteRecord] = {}

    async def list_for_user(
        self,
        user_id: str,
        *,
        include_shared_in_match_id: str | None = None,
    ) -> list[NoteRecord]:
        out: list[NoteRecord] = []
        for r in self.rows.values():
            if r.user_id == user_id:
                out.append(r)
                continue
            if (
                include_shared_in_match_id is not None
                and r.shared_in_match_id == include_shared_in_match_id
            ):
                out.append(r)
        return sorted(out, key=lambda r: r.created_at, reverse=True)

    async def get(self, note_id: str) -> NoteRecord | None:
        return self.rows.get(note_id)

    async def create(
        self,
        *,
        note_id: str,
        user_id: str,
        title: str,
        body: str,
        shared_in_match_id: str | None = None,
    ) -> NoteRecord:
        now = datetime.now(UTC)
        record = NoteRecord(
            id=note_id,
            user_id=user_id,
            title=title,
            body=body,
            done=False,
            created_at=now,
            updated_at=now,
            shared_in_match_id=shared_in_match_id,
        )
        self.rows[note_id] = record
        return record

    async def update(
        self,
        *,
        note_id: str,
        user_id: str,
        title: str | None = None,
        body: str | None = None,
        done: bool | None = None,
        shared_in_match_id: str | None | UnsetType = UNSET,
    ) -> NoteRecord:
        row = self.rows.get(note_id)
        if row is None or row.user_id != user_id:
            raise NotFoundError("note_not_found")
        if title is not None:
            row.title = title
        if body is not None:
            row.body = body
        if done is not None:
            row.done = done
        if not isinstance(shared_in_match_id, UnsetType):
            row.shared_in_match_id = shared_in_match_id
        return row

    async def delete(self, *, note_id: str, user_id: str) -> None:
        row = self.rows.get(note_id)
        if row is None or row.user_id != user_id:
            raise NotFoundError("note_not_found")
        del self.rows[note_id]


class FakeIdGen(IIdGenerator):
    def __init__(self, ids: list[str]) -> None:
        self._it = iter(ids)

    def new_id(self) -> str:
        return next(self._it)


def _seed_match(matches: FakeMatchRepo, *, match_id: str, a: str, b: str) -> Match:
    now = datetime(2026, 5, 16, tzinfo=UTC)
    match = Match(
        id=match_id,
        requester_id=a,
        candidate_id=b,
        compatibility=80,
        reason="overlap",
        status=MatchStatus.ACCEPTED,
        created_at=now,
        updated_at=now,
    )
    matches.rows[match_id] = match
    return match


def _service(*, ids: list[str] | None = None) -> tuple[NoteService, FakeNoteRepo, FakeMatchRepo]:
    notes = FakeNoteRepo()
    matches = FakeMatchRepo()
    svc = NoteService(notes=notes, matches=matches, ids=FakeIdGen(ids or ["n-1", "n-2", "n-3"]))
    return svc, notes, matches


# ── logic ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_without_match_id_returns_only_own_notes() -> None:
    svc, repo, _ = _service()
    await repo.create(note_id="n-mine", user_id="alice", title="A", body="")
    await repo.create(
        note_id="n-other",
        user_id="bob",
        title="B",
        body="",
        shared_in_match_id="m-1",
    )

    out = await svc.list_for_user(user_id="alice")

    assert [n.id for n in out] == ["n-mine"]


@pytest.mark.asyncio
async def test_list_with_match_id_includes_partner_shared_notes() -> None:
    svc, repo, matches = _service()
    _seed_match(matches, match_id="m-1", a="alice", b="bob")
    # bob's note shared into the match.
    await repo.create(
        note_id="n-bob",
        user_id="bob",
        title="Bob",
        body="",
        shared_in_match_id="m-1",
    )

    out = await svc.list_for_user(user_id="alice", match_id="m-1")

    assert {n.id for n in out} == {"n-bob"}


@pytest.mark.asyncio
async def test_create_with_shared_in_match_id_records_share() -> None:
    svc, _, matches = _service()
    _seed_match(matches, match_id="m-1", a="alice", b="bob")

    note = await svc.create(
        user_id="alice", title="hi", body="", shared_in_match_id="m-1"
    )

    assert note.shared_in_match_id == "m-1"


@pytest.mark.asyncio
async def test_update_flipping_share_persists() -> None:
    svc, repo, matches = _service()
    _seed_match(matches, match_id="m-1", a="alice", b="bob")
    await repo.create(note_id="n-1", user_id="alice", title="t", body="")

    updated = await svc.update(
        user_id="alice", note_id="n-1", shared_in_match_id="m-1"
    )

    assert updated.shared_in_match_id == "m-1"


# ── error ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_with_unknown_match_raises_not_found() -> None:
    svc, _, _ = _service()
    with pytest.raises(NotFoundError) as exc:
        await svc.list_for_user(user_id="alice", match_id="ghost")
    assert "match_not_found" in str(exc.value)


@pytest.mark.asyncio
async def test_list_for_non_match_member_raises_forbidden() -> None:
    svc, _, matches = _service()
    _seed_match(matches, match_id="m-1", a="alice", b="bob")
    with pytest.raises(ForbiddenError) as exc:
        await svc.list_for_user(user_id="eve", match_id="m-1")
    assert "not_match_member" in str(exc.value)


@pytest.mark.asyncio
async def test_create_with_shared_match_rejects_non_member() -> None:
    svc, _, matches = _service()
    _seed_match(matches, match_id="m-1", a="alice", b="bob")
    with pytest.raises(ForbiddenError):
        await svc.create(
            user_id="eve", title="hi", body="", shared_in_match_id="m-1"
        )


@pytest.mark.asyncio
async def test_update_demoting_to_private_does_not_require_match_check() -> None:
    # Demoting (shared_in_match_id=None) doesn't expose the note to a
    # new audience, so we don't require ``eve`` to be a match member.
    # But ``eve`` still can't update someone else's note — the repo's
    # owner check (NotFoundError) catches that.
    svc, repo, _ = _service()
    await repo.create(
        note_id="n-1",
        user_id="alice",
        title="t",
        body="",
        shared_in_match_id="m-1",
    )

    updated = await svc.update(
        user_id="alice", note_id="n-1", shared_in_match_id=None
    )

    assert updated.shared_in_match_id is None


# ── object-state ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_without_share_kwarg_leaves_share_untouched() -> None:
    svc, repo, _ = _service()
    await repo.create(
        note_id="n-1",
        user_id="alice",
        title="t",
        body="",
        shared_in_match_id="m-1",
    )

    updated = await svc.update(user_id="alice", note_id="n-1", done=True)

    assert (updated.done, updated.shared_in_match_id) == (True, "m-1")
