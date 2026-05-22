from __future__ import annotations

from app.core.clock import IClock
from app.core.events import EventBus
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    IdempotencyConflictError,
    IdempotencyViolationError,
    NotFoundError,
)
from app.core.ids import IIdGenerator
from app.domain.events import SessionAbandoned, SessionCompleted, SessionStarted
from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus
from app.domain.models.focus_session import default_duration
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.match_repo import IMatchReader


class FocusSessionService:
    """Orchestrates Pomodoro session lifecycle.

    Stays free of FastAPI / SQLAlchemy imports — depends only on Protocols.
    """

    def __init__(
        self,
        *,
        repo: IFocusSessionRepo,
        clock: IClock,
        ids: IIdGenerator,
        events: EventBus,
        matches: IMatchReader | None = None,
    ) -> None:
        self._repo = repo
        self._clock = clock
        self._ids = ids
        self._events = events
        # Optional so unit tests that don't exercise the partnered path
        # don't have to wire a mock match reader. Production DI always
        # supplies one (see api/v1/sessions/router.py `_service`).
        self._matches = matches

    async def start(
        self,
        *,
        user_id: str,
        mode: FocusSessionMode,
        duration_seconds: int | None,
        task_label: str | None,
        partner_user_id: str | None,
        idempotency_key: str | None = None,
        body_hash: str | None = None,
    ) -> FocusSession:
        if partner_user_id:
            if partner_user_id == user_id:
                raise ConflictError("partner_cannot_be_self")
            if self._matches is None:
                # Defence in depth — callers must wire IMatchReader to use
                # the partnered path. Refusing the start is safer than
                # silently storing an unverified partner pointer.
                raise ForbiddenError("partner_not_verified")
            ok = await self._matches.has_accepted_pair_between(
                user_a_id=user_id, user_b_id=partner_user_id
            )
            if not ok:
                raise ForbiddenError("partner_not_matched")

        if idempotency_key is not None:
            existing = await self._repo.get_by_user_and_idem(
                user_id=user_id, idempotency_key=idempotency_key
            )
            if existing is not None:
                session, stored_hash = existing
                # Same key + same body → idempotent replay; return the row
                # the first call created without re-publishing SessionStarted
                # (subscribers like coin / achievement awards already ran).
                if body_hash is not None and stored_hash == body_hash:
                    return session
                # Same key + different body → caller reused the key by
                # mistake (or two different intents collided). Refuse rather
                # than silently returning a row with mismatched parameters.
                raise IdempotencyConflictError("idempotency_key_reused")

        now = self._clock.now()
        try:
            session = await self._repo.create(
                session_id=self._ids.new_id(),
                user_id=user_id,
                mode=mode,
                duration_seconds=duration_seconds or default_duration(mode),
                task_label=task_label,
                partner_user_id=partner_user_id,
                started_at=now,
                idempotency_key=idempotency_key,
                idempotency_body_hash=body_hash,
            )
        except IdempotencyViolationError:
            # Repo translated the partial-unique-index trip into a domain
            # exception. A concurrent POST committed first; re-read the
            # winning row and apply the same body-hash check we would have
            # done above had the SELECT-for-update spotted it.
            existing = await self._repo.get_by_user_and_idem(
                user_id=user_id, idempotency_key=idempotency_key  # type: ignore[arg-type]
            )
            if existing is None:
                # Vanishingly unlikely: the row disappeared between INSERT
                # failure and SELECT. Surface as a generic conflict.
                raise ConflictError("idempotency_race_unresolved") from None
            session, stored_hash = existing
            if body_hash is not None and stored_hash != body_hash:
                raise IdempotencyConflictError("idempotency_key_reused") from None
            return session
        await self._events.publish(
            SessionStarted(
                session_id=session.id,
                user_id=user_id,
                partner_user_id=partner_user_id,
                started_at=now,
            )
        )
        return session

    async def complete(self, *, session_id: str, user_id: str) -> FocusSession:
        session = await self.get_owned(session_id=session_id, user_id=user_id)
        if not session.can_transition_to(FocusSessionStatus.COMPLETED):
            raise ConflictError("session_not_active")
        now = self._clock.now()
        elapsed = min(session.duration_seconds, int((now - session.started_at).total_seconds()))
        try:
            updated = await self._repo.update_status(
                session_id=session.id,
                status=FocusSessionStatus.COMPLETED,
                elapsed_seconds=elapsed,
                ended_at=now,
            )
        except NotFoundError:
            # Lost the race with sweep_abandoned or a concurrent /complete —
            # the row already flipped to a terminal state. Surface as a
            # state-machine conflict, not 404.
            raise ConflictError("session_not_active") from None
        await self._events.publish(
            SessionCompleted(
                session_id=updated.id,
                user_id=user_id,
                partner_user_id=updated.partner_user_id,
                duration_seconds=updated.duration_seconds,
                ended_at=now,
            )
        )
        return updated

    async def cancel(self, *, session_id: str, user_id: str) -> FocusSession:
        session = await self.get_owned(session_id=session_id, user_id=user_id)
        if not session.can_transition_to(FocusSessionStatus.CANCELLED):
            raise ConflictError("session_not_active")
        now = self._clock.now()
        elapsed = min(session.duration_seconds, int((now - session.started_at).total_seconds()))
        try:
            return await self._repo.update_status(
                session_id=session.id,
                status=FocusSessionStatus.CANCELLED,
                elapsed_seconds=elapsed,
                ended_at=now,
            )
        except NotFoundError:
            raise ConflictError("session_not_active") from None

    async def sweep_abandoned(self) -> list[FocusSession]:
        """Worker hook: mark sessions whose duration expired without explicit completion.

        Race correctness depends on `update_status` only writing when the row
        is still `active` (see `IFocusSessionRepo.update_status` impl, which
        scopes the UPDATE with `WHERE status = 'active' RETURNING id`). If the
        user just completed/cancelled in the same second, the UPDATE returns
        zero rows and `update_status` raises NotFoundError; we treat that as
        "someone else terminated it first" and skip the event so achievement
        handlers don't double-fire."""
        now = self._clock.now()
        result: list[FocusSession] = []
        for session in await self._repo.list_active():
            elapsed = int((now - session.started_at).total_seconds())
            if elapsed < session.duration_seconds + 60:  # 60s grace
                continue
            try:
                updated = await self._repo.update_status(
                    session_id=session.id,
                    status=FocusSessionStatus.ABANDONED,
                    elapsed_seconds=session.duration_seconds,
                    ended_at=now,
                )
            except NotFoundError:
                # Raced with /complete or /cancel — the row is already
                # terminal. Skip silently; the other path published its
                # own event.
                continue
            await self._events.publish(
                SessionAbandoned(
                    session_id=updated.id, user_id=updated.user_id, ended_at=now
                )
            )
            result.append(updated)
        return result

    async def get_owned(self, *, session_id: str, user_id: str) -> FocusSession:
        session = await self._repo.get(session_id)
        if session is None:
            raise NotFoundError("session_not_found")
        if session.user_id != user_id and session.partner_user_id != user_id:
            raise ForbiddenError("not_session_member")
        return session
