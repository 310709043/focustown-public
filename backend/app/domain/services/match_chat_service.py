from __future__ import annotations

from typing import Any

from app.core.clock import IClock
from app.core.exceptions import (
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.ids import IIdGenerator
from app.domain.repositories.match_realtime_repo import (
    IMatchAgendaRepo,
    IMatchMessageRepo,
    MatchAgendaItem,
    MatchMessage,
)
from app.domain.repositories.match_repo import IMatchRepo
from app.domain.repositories.realtime import IRealtimePublisher

ALLOWED_KINDS = frozenset({"text", "note_share", "system"})
ALLOWED_AGENDA_STATUS = frozenset({"pending", "in_progress", "done"})
MAX_BODY_LEN = 2_000
MAX_AGENDA_LEN = 280


class MatchChatService:
    """Chat scrollback + send. SOLID: depends on `IMatchMessageRepo` +
    `IMatchRepo` (participant gate) + `IRealtimePublisher` (fan-out)."""

    def __init__(
        self,
        *,
        messages: IMatchMessageRepo,
        matches: IMatchRepo,
        publisher: IRealtimePublisher | None,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._messages = messages
        self._matches = matches
        self._pub = publisher
        self._ids = ids
        self._clock = clock

    async def list_messages(
        self,
        *,
        viewer_id: str,
        match_id: str,
        cursor: str | None = None,
        limit: int = 50,
    ) -> list[MatchMessage]:
        await self._assert_member(match_id, viewer_id)
        return await self._messages.list_by_match(
            match_id, cursor=cursor, limit=limit
        )

    async def send(
        self,
        *,
        sender_id: str,
        match_id: str,
        kind: str,
        body: str,
        metadata: dict[str, Any] | None,
    ) -> MatchMessage:
        await self._assert_member(match_id, sender_id)
        kind = (kind or "text").strip().lower()
        if kind not in ALLOWED_KINDS:
            raise ValidationError("invalid_message_kind")
        body = (body or "").strip()
        if not body:
            raise ValidationError("body_required")
        if len(body) > MAX_BODY_LEN:
            raise ValidationError("body_too_long")
        row = await self._messages.create(
            message_id=self._ids.new_id(),
            match_id=match_id,
            sender_id=sender_id,
            kind=kind,
            body=body,
            metadata=metadata,
        )
        if self._pub is not None:
            await self._pub.publish(
                IRealtimePublisher.room_channel(match_id),
                {
                    "type": "chat.message",
                    "id": row.id,
                    "match_id": match_id,
                    "sender_id": sender_id,
                    "kind": kind,
                    "body": body,
                    "metadata": metadata,
                    "created_at": row.created_at.isoformat(),
                },
            )
        return row

    async def _assert_member(self, match_id: str, user_id: str) -> None:
        match = await self._matches.get(match_id)
        if match is None:
            raise NotFoundError("match_not_found")
        if user_id not in (match.requester_id, match.candidate_id):
            raise ForbiddenError("not_a_match_member")


class MatchAgendaService:
    """Collaborative checklist for a matched focus room."""

    def __init__(
        self,
        *,
        agenda: IMatchAgendaRepo,
        matches: IMatchRepo,
        publisher: IRealtimePublisher | None,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._agenda = agenda
        self._matches = matches
        self._pub = publisher
        self._ids = ids
        self._clock = clock

    async def list_items(
        self, *, viewer_id: str, match_id: str
    ) -> list[MatchAgendaItem]:
        await self._assert_member(match_id, viewer_id)
        return await self._agenda.list_by_match(match_id)

    async def create_item(
        self, *, creator_id: str, match_id: str, body: str
    ) -> MatchAgendaItem:
        await self._assert_member(match_id, creator_id)
        body = (body or "").strip()
        if not body:
            raise ValidationError("body_required")
        if len(body) > MAX_AGENDA_LEN:
            raise ValidationError("body_too_long")
        position = await self._agenda.next_position(match_id)
        item = await self._agenda.create(
            item_id=self._ids.new_id(),
            match_id=match_id,
            position=position,
            body=body,
            created_by=creator_id,
        )
        await self._broadcast("agenda.item_added", item)
        return item

    async def update_item(
        self,
        *,
        actor_id: str,
        item_id: str,
        body: str | None = None,
        status: str | None = None,
        position: int | None = None,
    ) -> MatchAgendaItem:
        item = await self._agenda.get(item_id)
        if item is None:
            raise NotFoundError("agenda_item_not_found")
        await self._assert_member(item.match_id, actor_id)
        if body is not None:
            body = body.strip()
            if not body:
                raise ValidationError("body_required")
            if len(body) > MAX_AGENDA_LEN:
                raise ValidationError("body_too_long")
        if status is not None and status not in ALLOWED_AGENDA_STATUS:
            raise ValidationError("invalid_status")
        checked_by = actor_id if status == "done" else None
        checked_at = self._clock.now() if status == "done" else None
        updated = await self._agenda.update(
            item_id,
            body=body,
            status=status,
            position=position,
            checked_by=checked_by,
            checked_at=checked_at,
        )
        if updated is None:
            raise NotFoundError("agenda_item_not_found")
        await self._broadcast("agenda.item_updated", updated)
        return updated

    async def delete_item(self, *, actor_id: str, item_id: str) -> None:
        item = await self._agenda.get(item_id)
        if item is None:
            return
        await self._assert_member(item.match_id, actor_id)
        await self._agenda.delete(item_id)
        if self._pub is not None:
            await self._pub.publish(
                IRealtimePublisher.room_channel(item.match_id),
                {
                    "type": "agenda.item_removed",
                    "id": item.id,
                    "match_id": item.match_id,
                },
            )

    async def _assert_member(self, match_id: str, user_id: str) -> None:
        match = await self._matches.get(match_id)
        if match is None:
            raise NotFoundError("match_not_found")
        if user_id not in (match.requester_id, match.candidate_id):
            raise ForbiddenError("not_a_match_member")

    async def _broadcast(self, kind: str, item: MatchAgendaItem) -> None:
        if self._pub is None:
            return
        await self._pub.publish(
            IRealtimePublisher.room_channel(item.match_id),
            {
                "type": kind,
                "id": item.id,
                "match_id": item.match_id,
                "position": item.position,
                "body": item.body,
                "status": item.status,
                "checked_by": item.checked_by,
            },
        )
