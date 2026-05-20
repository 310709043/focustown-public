from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.stations.schemas import (
    StationCursorDTO,
    StationResponse,
    StationTrackDTO,
)
from app.core.clock import SystemClock
from app.core.deps import CurrentUserId, DbDep, RealtimePublisherDep, SettingsDep
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.ids import UUID4Generator
from app.domain.services.station_service import StationService
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.cache.station_cache import RedisStationCache
from app.infrastructure.db.repositories import SqlMatchRepo, SqlTrackRepo
from app.infrastructure.db.repositories.station_repo import SqlStationSnapshotRepo

router = APIRouter()

_RESPONSE_CACHE_TTL_SECONDS = 1


def _build_service(db, publisher) -> StationService:
    repo = SqlStationSnapshotRepo(db, UUID4Generator())
    return StationService(
        cache=RedisStationCache(get_redis()),
        snapshots_reader=repo,
        snapshots_writer=repo,
        tracks=SqlTrackRepo(db),
        realtime=publisher,
        clock=SystemClock(),
    )


async def _build_response(
    svc: StationService, *, kind, scope_id: str
) -> StationResponse:
    cursor = await svc.get_current(kind=kind, scope_id=scope_id)
    track_records = await svc.tracks.get_many_by_ids(cursor.playlist_ids)
    by_id = {t.id: t for t in track_records}
    # Preserve cursor ordering — the catalog batch returns rows in id order.
    tracks: list[StationTrackDTO] = []
    for tid in cursor.playlist_ids:
        t = by_id.get(tid)
        if t is None:
            continue
        tracks.append(
            StationTrackDTO(
                id=t.id,
                title=t.title,
                artist=t.artist,
                mood=t.mood,
                duration_ms=t.duration_ms,
                content_type=t.content_type,
            )
        )
    return StationResponse(
        cursor=StationCursorDTO(
            kind=cursor.kind,
            scope_id=cursor.scope_id,
            playlist_ids=cursor.playlist_ids,
            cursor_index=cursor.cursor_index,
            started_at_ms=cursor.started_at_ms,
            version=cursor.version,
        ),
        tracks=tracks,
    )


async def _cached_response(
    *, cache_key: str, build: callable
) -> StationResponse:
    """1s response-level cache to absorb connect-storms.

    The cursor itself lives in Redis; this cache wraps the FULL response
    (cursor + hydrated tracks) so a stampede of subscribers asking for
    /stations/city only hits Postgres once per second worst-case.
    """
    redis = get_redis()
    raw = await redis.get(cache_key)
    if raw is not None:
        return StationResponse.model_validate_json(raw)
    response = await build()
    await redis.set(
        cache_key, response.model_dump_json(), ex=_RESPONSE_CACHE_TTL_SECONDS
    )
    return response


@router.get("/city", response_model=StationResponse)
async def get_city_station(
    user_id: CurrentUserId,
    db: DbDep,
    publisher: RealtimePublisherDep,
    settings: SettingsDep,
) -> StationResponse:
    """Current global city-station cursor + hydrated track list.

    Auth-only (any signed-in user) — the city station is a shared public
    cohort, no per-user gate beyond an authenticated session.
    """
    if not settings.feat_shared_station:
        raise NotFoundError("station_disabled")
    svc = _build_service(db, publisher)
    return await _cached_response(
        cache_key=f"station:city:{settings.default_city_id}:rest",
        build=lambda: _build_response(
            svc, kind="city", scope_id=settings.default_city_id
        ),
    )


@router.get("/pair/{match_id}", response_model=StationResponse)
async def get_pair_station(
    match_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    publisher: RealtimePublisherDep,
    settings: SettingsDep,
) -> StationResponse:
    """Current pair-station cursor + hydrated track list.

    403 if requester is not a member of the match (requester_id or
    candidate_id). The membership check is the only gate — both pair
    members have identical permissions.
    """
    if not settings.feat_shared_station:
        raise NotFoundError("station_disabled")
    match = await SqlMatchRepo(db).get(match_id)
    if match is None:
        raise NotFoundError("match_not_found")
    if user_id not in (match.requester_id, match.candidate_id):
        raise ForbiddenError("not_a_match_member")
    svc = _build_service(db, publisher)
    # Per-scope cache key — pair stations are scoped to the match so the
    # response cache never leaks data across pairs.
    return await _cached_response(
        cache_key=f"station:pair:{match_id}:rest",
        build=lambda: _build_response(svc, kind="pair", scope_id=match_id),
    )
