from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(default="", max_length=128)
    body: str = Field(default="", max_length=10_000)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=128)
    body: str | None = Field(default=None, max_length=10_000)
    done: bool | None = None


class NoteResponse(BaseModel):
    id: str
    title: str
    body: str
    done: bool
    created_at: datetime
    updated_at: datetime
