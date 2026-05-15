from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.core.sentinels import UNSET, UnsetType


class NoteCreate(BaseModel):
    title: str = Field(default="", max_length=128)
    body: str = Field(default="", max_length=10_000)
    shared_in_match_id: str | None = Field(default=None, max_length=36)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=128)
    body: str | None = Field(default=None, max_length=10_000)
    done: bool | None = None
    # Optional/null discrimination: passing ``null`` demotes a shared
    # note back to private; omitting the field leaves the share
    # untouched. Pydantic delivers omitted fields as the model's
    # default (``UNSET``), so the router can read the sentinel.
    shared_in_match_id: str | None | UnsetType = UNSET

    model_config = {"arbitrary_types_allowed": True}


class NoteResponse(BaseModel):
    id: str
    user_id: str
    title: str
    body: str
    done: bool
    created_at: datetime
    updated_at: datetime
    shared_in_match_id: str | None = None
