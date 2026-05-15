from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.v1.playback.schemas import (
    PersonalPlaylistResponse,
    PlaylistContextLiteral,
    PlaylistTrack,
)
from app.core.clock import SystemClock
from app.core.deps import CurrentUserId, DbDep
from app.domain.services.playlist_service import PlaylistService
from app.infrastructure.db.repositories import SqlTrackRepo

router = APIRouter()


@router.get("/playlist", response_model=PersonalPlaylistResponse)
async def get_personal_playlist(
    user_id: CurrentUserId,
    db: DbDep,
    context: PlaylistContextLiteral = Query("city"),  # noqa: B008
    context_id: str | None = Query(None, max_length=64),
) -> PersonalPlaylistResponse:
    """Return today's personalized random shuffle of the official catalog.

    The result is deterministic for the (user_id, context, context_id,
    server-date) tuple — refreshing the page gives the same order, but
    a different user / context / day gives a different order. See
    ``PlaylistService`` for the seed formula.
    """
    clock = SystemClock()
    svc = PlaylistService(tracks=SqlTrackRepo(db), clock=clock)
    tracks = await svc.get_personal_playlist(
        user_id=user_id, context=context, context_id=context_id
    )
    return PersonalPlaylistResponse(
        context=context,
        context_id=context_id,
        day=clock.now().date().isoformat(),
        tracks=[
            PlaylistTrack(
                id=t.id,
                title=t.title,
                artist=t.artist,
                mood=t.mood,
                duration_ms=t.duration_ms,
                content_type=t.content_type,
            )
            for t in tracks
        ],
    )
