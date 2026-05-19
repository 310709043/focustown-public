from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class FeedbackSubmitRequest(BaseModel):
    category: str = Field(min_length=1, max_length=32)
    body: str = Field(min_length=1, max_length=4_000)
    contact_email: EmailStr | None = None
    locale: str = Field(min_length=2, max_length=8)
    app_version: str | None = Field(default=None, max_length=32)
    context: dict[str, Any] | None = None


class FeedbackSubmitResponse(BaseModel):
    id: str
    status: str
    created_at: datetime
