from __future__ import annotations

from datetime import timedelta

from app.core.clock import IClock
from app.core.events import EventBus
from app.core.exceptions import ConflictError, NotFoundError
from app.core.ids import IIdGenerator
from app.domain.events import MatchAccepted, MatchProposed
from app.domain.models import Match, MatchStatus
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.match_repo import IMatchRepo
from app.domain.repositories.user_repo import IUserReader
from app.domain.services.strategies.compatibility import ICompatibilityStrategy


class MatchingService:
    """Coordinates compatibility scoring and match lifecycle.

    DIP: depends on IUserReader / IMatchRepo / IFocusSessionRepo Protocols and on
    a pluggable ICompatibilityStrategy. The HTTP router wires concrete impls.
    """

    def __init__(
        self,
        *,
        users: IUserReader,
        matches: IMatchRepo,
        sessions: IFocusSessionRepo,
        strategy: ICompatibilityStrategy,
        events: EventBus,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._users = users
        self._matches = matches
        self._sessions = sessions
        self._strategy = strategy
        self._events = events
        self._ids = ids
        self._clock = clock

    async def propose(self, *, requester_id: str, candidate_id: str) -> Match:
        requester = await self._users.get_by_id(requester_id)
        candidate = await self._users.get_by_id(candidate_id)
        if requester is None or candidate is None:
            raise NotFoundError("user_not_found")
        if requester.id == candidate.id:
            raise ConflictError("cannot_match_self")

        # MVP: hour-of-day buckets from each user's start times in 7d window
        since = self._clock.now() - timedelta(days=7)
        r_sessions = await self._sessions.list_by_user_since(
            user_id=requester.id, since=since
        )
        c_sessions = await self._sessions.list_by_user_since(
            user_id=candidate.id, since=since
        )
        r_hours = [s.started_at.hour for s in r_sessions]
        c_hours = [s.started_at.hour for s in c_sessions]

        scoring = await self._strategy.score(
            requester=requester,
            candidate=candidate,
            requester_focus_starts=r_hours,
            candidate_focus_starts=c_hours,
        )
        match = await self._matches.create(
            match_id=self._ids.new_id(),
            requester_id=requester.id,
            candidate_id=candidate.id,
            compatibility=scoring.score,
            reason=scoring.reason,
        )
        await self._events.publish(
            MatchProposed(
                match_id=match.id,
                requester_id=requester.id,
                candidate_id=candidate.id,
                compatibility=scoring.score,
            )
        )
        return match

    async def accept(self, *, match_id: str, user_id: str) -> Match:
        match = await self._matches.get(match_id)
        if match is None:
            raise NotFoundError("match_not_found")
        if user_id not in (match.requester_id, match.candidate_id):
            raise ConflictError("not_match_member")
        if match.status is not MatchStatus.PENDING:
            raise ConflictError("match_not_pending")
        updated = await self._matches.update_status(
            match_id=match_id, status=MatchStatus.ACCEPTED
        )
        await self._events.publish(
            MatchAccepted(
                match_id=updated.id,
                requester_id=updated.requester_id,
                candidate_id=updated.candidate_id,
            )
        )
        return updated

    async def skip(self, *, match_id: str, user_id: str) -> Match:
        match = await self._matches.get(match_id)
        if match is None:
            raise NotFoundError("match_not_found")
        if user_id not in (match.requester_id, match.candidate_id):
            raise ConflictError("not_match_member")
        return await self._matches.update_status(
            match_id=match_id, status=MatchStatus.SKIPPED
        )
