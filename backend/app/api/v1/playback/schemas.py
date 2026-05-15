from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PlaylistContextLiteral = Literal["city", "focus", "room"]


class PlaylistTrack(BaseModel):
    id: str
    title: str
    artist: str | None
    mood: str
    duration_ms: int | None
    content_type: str


class PersonalPlaylistResponse(BaseModel):
    context: PlaylistContextLiteral
    context_id: str | None = None
    day: str = Field(description="Server date used to seed the shuffle (YYYY-MM-DD)")
    tracks: list[PlaylistTrack]
