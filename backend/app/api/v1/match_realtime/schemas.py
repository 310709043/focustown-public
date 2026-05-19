from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChatMessageDTO(BaseModel):
    id: str
    match_id: str
    sender_id: str
    kind: str
    body: str
    metadata: dict[str, Any] | None = None
    created_at: datetime


class ChatMessagesResponse(BaseModel):
    messages: list[ChatMessageDTO]


class SendChatRequest(BaseModel):
    kind: str = Field(default="text", max_length=16)
    body: str = Field(min_length=1, max_length=2000)
    metadata: dict[str, Any] | None = None


class AgendaItemDTO(BaseModel):
    id: str
    match_id: str
    position: int
    body: str
    status: str
    created_by: str
    checked_by: str | None = None
    checked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AgendaListResponse(BaseModel):
    items: list[AgendaItemDTO]


class AgendaCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=280)


class AgendaUpdateRequest(BaseModel):
    body: str | None = Field(default=None, max_length=280)
    status: str | None = Field(default=None, max_length=16)
    position: int | None = Field(default=None, ge=0)
