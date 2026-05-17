from __future__ import annotations

from pydantic import BaseModel, Field


class ClientErrorReport(BaseModel):
    """Frontend-originated error payload.

    `message` and `stack` are bounded so a runaway exception loop in the
    browser can't flood our log volume; the limits sit well above any
    legitimate React/Next.js stack trace.
    """

    message: str = Field(..., min_length=1, max_length=2000)
    stack: str | None = Field(default=None, max_length=8000)
    request_id: str | None = Field(default=None, max_length=128)
    route: str | None = Field(default=None, max_length=512)


class ClientErrorAck(BaseModel):
    ok: bool = True
