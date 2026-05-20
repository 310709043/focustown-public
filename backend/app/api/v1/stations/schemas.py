from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class StationCursorDTO(BaseModel):
    kind: Literal["city", "pair"]
    scope_id: str
    playlist_ids: list[str]
    cursor_index: int
    started_at_ms: int
    version: int


class StationTrackDTO(BaseModel):
    id: str
    title: str
    artist: str | None
    mood: str
    duration_ms: int | None
    content_type: str


class StationResponse(BaseModel):
    cursor: StationCursorDTO
    tracks: list[StationTrackDTO]
