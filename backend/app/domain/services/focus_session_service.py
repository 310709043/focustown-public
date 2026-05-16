from __future__ import annotations

from app.core.clock import IClock
from app.core.events import EventBus
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.ids import IIdGenerator
from app.domain.events import SessionAbandoned, SessionCompleted, SessionStarted
from app.domain.models import FocusSession, FocusSessionMode, FocusSessionStatus
from app.domain.models.focus_session import default_duration
from app.domain.repositories.focus_session_repo import IFocusSessionRepo


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
    ) -> None:
        self._repo = repo
        self._clock = clock
        self._ids = ids
        self._events = events

    async def start(
        self,
        *,
        user_id: str,
        mode: FocusSessionMode,
        duration_seconds: int | None,
        task_label: str | None,
        partner_user_id: str | None,
    ) -> FocusSession:
        now = self._clock.now()
        session = await self._repo.create(
            session_id=self._ids.new_id(),
            user_id=user_id,
            mode=mode,
            duration_seconds=duration_seconds or default_duration(mode),
            task_label=task_label,
            partner_user_id=partner_user_id,
            started_at=now,
        )
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
        updated = await self._repo.update_status(
            session_id=session.id,
            status=FocusSessionStatus.COMPLETED,
            elapsed_seconds=elapsed,
            ended_at=now,
        )
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
        return await self._repo.update_status(
            session_id=session.id,
            status=FocusSessionStatus.CANCELLED,
            elapsed_seconds=elapsed,
            ended_at=now,
        )

    async def sweep_abandoned(self) -> list[FocusSession]:
        """Worker hook: mark sessions whose duration expired without explicit completion."""
        now = self._clock.now()
        result: list[FocusSession] = []
        for session in await self._repo.list_active():
            elapsed = int((now - session.started_at).total_seconds())
            if elapsed >= session.duration_seconds + 60:  # 60s grace
                updated = await self._repo.update_status(
                    session_id=session.id,
                    status=FocusSessionStatus.ABANDONED,
                    elapsed_seconds=session.duration_seconds,
                    ended_at=now,
                )
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
