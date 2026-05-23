from __future__ import annotations

import os

import anyio.to_thread
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, StreamingResponse

from app.api.v1.broadcast.schemas import BroadcastPlayTokenResponse
from app.core.deps import CurrentUserId, SettingsDep, StorageDep
from app.core.exceptions import AuthError, NotFoundError
from app.core.logging import get_logger
from app.domain.services.broadcast_token_service import (
    KNOWN_CLIP_IDS,
    BroadcastTokenService,
    clip_file_key,
)

log = get_logger(__name__)
router = APIRouter()


def _api_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _service(settings, request: Request) -> BroadcastTokenService:
    return BroadcastTokenService(settings, api_base_url=_api_base_url(request))


@router.post(
    "/{clip_id}/play-token", response_model=BroadcastPlayTokenResponse
)
async def issue_broadcast_play_token(
    clip_id: str,
    request: Request,
    settings: SettingsDep,
    user_id: CurrentUserId,
) -> BroadcastPlayTokenResponse:
    """Issue a short-TTL JWT authorizing playback of one broadcast clip.

    The returned ``url`` points at the broadcast proxy (Cloudflare
    Worker in prod; backend ``/stream`` in dev). Token is single-clip-
    scoped and expires per ``broadcast_token_ttl_seconds`` (default 5
    min) so a leaked URL stops working quickly. Requiring auth here
    means scrapers can't farm tokens anonymously.
    """
    if clip_id not in KNOWN_CLIP_IDS:
        log.info("broadcast_play_token_unknown_clip", clip_id=clip_id, user_id=user_id)
        raise NotFoundError("broadcast_clip_not_found")
    tok = _service(settings, request).issue(clip_id=clip_id, user_id=user_id)
    # Happy-path observability: without this, a silent "no video" symptom
    # is indistinguishable from "FE never called the endpoint" in CloudWatch.
    # Never log the token body itself — only metadata.
    log.info(
        "broadcast_play_token_issued",
        clip_id=clip_id,
        user_id=user_id,
        ttl_seconds=settings.broadcast_token_ttl_seconds,
    )
    return BroadcastPlayTokenResponse(url=tok.url, expires_at=tok.expires_at)


@router.get("/{clip_id}/stream")
async def stream_broadcast(
    clip_id: str,
    request: Request,
    settings: SettingsDep,
    storage: StorageDep,
    t: str | None = None,
):
    """Dev / local-FS only.

    In production BROADCAST_PROXY_BASE_URL points the play-token URL at
    the Cloudflare Worker, so this endpoint is never reached. Kept here
    so LocalFSStorage can serve bytes during local dev behind the same
    JWT contract the Worker enforces.
    """
    if clip_id not in KNOWN_CLIP_IDS:
        raise NotFoundError("broadcast_clip_not_found")

    if settings.broadcast_proxy_secret:
        if not t:
            raise AuthError("missing_broadcast_token")
        claims = _service(settings, request).verify(
            token=t, expected_clip_id=clip_id
        )
        # Defence-in-depth: the JWT-signed key must match the deterministic
        # clip → key mapping. Catches a forged token whose ``key`` points
        # at a different clip's bytes.
        if claims.file_key != clip_file_key(clip_id):
            raise AuthError("broadcast_token_key_mismatch")

    key = clip_file_key(clip_id)
    local_path = storage.path_for(key)
    if local_path is None:
        # S3-style storage without a Worker → refuse rather than leak
        # presigned URLs. Production deployments always set
        # BROADCAST_PROXY_BASE_URL, so this is unreachable in prod.
        raise NotFoundError("broadcast_proxy_not_configured")

    exists = await anyio.to_thread.run_sync(os.path.exists, local_path)
    if not exists:
        raise NotFoundError("broadcast_clip_file_missing")

    # Borrow the tracks router's range parser to avoid duplicating it
    # here — same byte-range contract, same 416 envelope.
    from app.api.v1.tracks.router import _iter_file_range, _parse_range

    file_size = await anyio.to_thread.run_sync(os.path.getsize, local_path)
    range_header = request.headers.get("range")

    if range_header:
        start, end = _parse_range(range_header, file_size)
        content_length = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
        }
        return StreamingResponse(
            _iter_file_range(local_path, start, end),
            status_code=206,
            media_type="video/mp4",
            headers=headers,
        )

    return FileResponse(
        local_path,
        media_type="video/mp4",
        headers={"Accept-Ranges": "bytes"},
    )
