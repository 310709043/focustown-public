from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from fastapi import status as http_status

from app.api.v1._common.pagination import Page, build_page
from app.api.v1.match_realtime.schemas import (
    AgendaCreateRequest,
    AgendaItemDTO,
    AgendaListResponse,
    AgendaUpdateRequest,
    ChatMessageDTO,
    SendChatRequest,
)
from app.core.deps import (
    ClockDep,
    CurrentUserId,
    DbDep,
    IdGenDep,
    RealtimePublisherDep,
)
from app.domain.services.bot_reply_service import BotReplyService
from app.domain.services.match_chat_service import (
    MatchAgendaService,
    MatchChatService,
)
from app.infrastructure.db.repositories import (
    SqlMatchAgendaRepo,
    SqlMatchMessageRepo,
    SqlMatchRepo,
    SqlUserRepo,
)

router = APIRouter()


def _chat(  # type: ignore[no-untyped-def]
    db, publisher, ids, clock
) -> MatchChatService:
    return MatchChatService(
        messages=SqlMatchMessageRepo(db),
        matches=SqlMatchRepo(db),
        publisher=publisher,
        ids=ids,
        clock=clock,
    )


def _agenda(  # type: ignore[no-untyped-def]
    db, publisher, ids, clock
) -> MatchAgendaService:
    return MatchAgendaService(
        agenda=SqlMatchAgendaRepo(db),
        matches=SqlMatchRepo(db),
        publisher=publisher,
        ids=ids,
        clock=clock,
    )


@router.get(
    "/{match_id}/messages", response_model=Page[ChatMessageDTO]
)
async def list_messages(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
    cursor: Annotated[str | None, Query(max_length=256)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Page[ChatMessageDTO]:
    svc = _chat(db, publisher, ids, clock)
    rows = await svc.list_messages(
        viewer_id=user_id, match_id=match_id, cursor=cursor, limit=limit
    )
    return build_page(
        rows,
        limit=limit,
        key=lambda r: (r.created_at, r.id),
        to_item=lambda r: ChatMessageDTO(**r.__dict__),
    )


@router.post(
    "/{match_id}/messages",
    response_model=ChatMessageDTO,
    status_code=http_status.HTTP_201_CREATED,
)
async def send_message(
    match_id: str,
    payload: SendChatRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> ChatMessageDTO:
    svc = _chat(db, publisher, ids, clock)
    row = await svc.send(
        sender_id=user_id,
        match_id=match_id,
        kind=payload.kind,
        body=payload.body,
        metadata=payload.metadata,
    )

    # Bot auto-reply: if the match partner is a bot, schedule a reply.
    if payload.kind == "text":
        bot_svc = BotReplyService(
            users=SqlUserRepo(db),
            matches=SqlMatchRepo(db),
            messages=SqlMatchMessageRepo(db),
            publisher=publisher,
            ids=ids,
            clock=clock,
        )
        bot_id = await bot_svc.get_bot_partner(match_id, user_id)
        if bot_id is not None:
            # Count existing messages to decide greeting vs mid-chat
            existing = await svc.list_messages(
                viewer_id=user_id, match_id=match_id, limit=100
            )
            bot_svc.schedule_reply(
                match_id=match_id,
                bot_id=bot_id,
                user_message=payload.body,
                message_count=len(existing),
            )

    return ChatMessageDTO(**row.__dict__)


@router.get("/{match_id}/agenda", response_model=AgendaListResponse)
async def list_agenda(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> AgendaListResponse:
    svc = _agenda(db, publisher, ids, clock)
    rows = await svc.list_items(viewer_id=user_id, match_id=match_id)
    return AgendaListResponse(
        items=[AgendaItemDTO(**r.__dict__) for r in rows]
    )


@router.post(
    "/{match_id}/agenda",
    response_model=AgendaItemDTO,
    status_code=http_status.HTTP_201_CREATED,
)
async def create_agenda_item(
    match_id: str,
    payload: AgendaCreateRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> AgendaItemDTO:
    svc = _agenda(db, publisher, ids, clock)
    row = await svc.create_item(
        creator_id=user_id, match_id=match_id, body=payload.body
    )
    return AgendaItemDTO(**row.__dict__)


@router.patch(
    "/{match_id}/agenda/{item_id}", response_model=AgendaItemDTO
)
async def update_agenda_item(
    match_id: str,
    item_id: str,
    payload: AgendaUpdateRequest,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> AgendaItemDTO:
    svc = _agenda(db, publisher, ids, clock)
    row = await svc.update_item(
        actor_id=user_id,
        item_id=item_id,
        body=payload.body,
        status=payload.status,
        position=payload.position,
    )
    return AgendaItemDTO(**row.__dict__)


@router.delete(
    "/{match_id}/agenda/{item_id}",
    status_code=http_status.HTTP_204_NO_CONTENT,
)
async def delete_agenda_item(
    match_id: str,
    item_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    publisher: RealtimePublisherDep,
) -> None:
    svc = _agenda(db, publisher, ids, clock)
    await svc.delete_item(actor_id=user_id, item_id=item_id)
