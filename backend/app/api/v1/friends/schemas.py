from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FriendRequestRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=36)


class FriendSummaryDTO(BaseModel):
    friendship_id: str
    user_id: str
    display_name: str
    character_key: str | None = None
    status: str
    requested_by_me: bool
    created_at: datetime
    accepted_at: datetime | None = None


class FriendsListResponse(BaseModel):
    friends: list[FriendSummaryDTO]


class FocusingNowItem(BaseModel):
    user_id: str
    display_name: str
    character_key: str | None = None
    session_id: str
    started_at: datetime
    minutes_planned: int | None = None


class FocusingNowResponse(BaseModel):
    friends_focusing: list[FocusingNowItem]


class FriendSearchResultDTO(BaseModel):
    user_id: str
    display_name: str
    character_key: str | None = None
    friendship_status: str
    friendship_id: str | None = None
    requested_by_me: bool


class FriendSearchResponse(BaseModel):
    results: list[FriendSearchResultDTO]
