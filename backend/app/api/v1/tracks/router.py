from __future__ import annotations

import os

import anyio.to_thread
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from starlette.status import HTTP_416_RANGE_NOT_SATISFIABLE

from app.api.v1.tracks.schemas import TrackResponse
from app.core.deps import DbDep, StorageDep
from app.core.exceptions import NotFoundError
from app.domain.repositories.track_repo import TrackRecord
from app.infrastructure.db.repositories import SqlTrackRepo

router = APIRouter()


def _dto(t: TrackRecord) -> TrackResponse:
    return TrackResponse(
        id=t.id,
        title=t.title,
        artist=t.artist,
        mood=t.mood,
        duration_ms=t.duration_ms,
        content_type=t.content_type,
        file_size_bytes=t.file_size_bytes,
        license=t.license,
        uploaded_by_user_id=t.uploaded_by_user_id,
        created_at=t.created_at,
    )


def _parse_range(header: str, file_size: int) -> tuple[int, int]:
    """Parse a single byte range (e.g. 'bytes=0-1023', 'bytes=1024-').

    Returns (start, end) inclusive. Raises HTTPException 416 on malformed
    input or unsatisfiable ranges. Multi-range requests are not supported
    (HTML5 audio doesn't need them).
    """
    if not header.startswith("bytes="):
        raise HTTPException(
            status_code=HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="invalid_range_unit",
        )
    spec = header[len("bytes=") :]
    if "," in spec:
        raise HTTPException(
            status_code=HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="multipart_range_unsupported",
        )
    try:
        start_s, end_s = spec.split("-", 1)
    except ValueError as e:
        raise HTTPException(
            status_code=HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="invalid_range_syntax",
        ) from e

    if start_s == "":
        # Suffix range: last N bytes.
        if end_s == "":
            raise HTTPException(
                status_code=HTTP_416_RANGE_NOT_SATISFIABLE,
                detail="invalid_range_syntax",
            )
        suffix_len = int(end_s)
        if suffix_len <= 0:
            raise HTTPException(
                status_code=HTTP_416_RANGE_NOT_SATISFIABLE,
                detail="invalid_range_syntax",
            )
        start = max(0, file_size - suffix_len)
        end = file_size - 1
    else:
        start = int(start_s)
        end = int(end_s) if end_s else file_size - 1

    if start < 0 or end < start or start >= file_size:
        raise HTTPException(
            status_code=HTTP_416_RANGE_NOT_SATISFIABLE,
            detail="range_out_of_bounds",
            headers={"Content-Range": f"bytes */{file_size}"},
        )
    end = min(end, file_size - 1)
    return start, end


def _iter_file_range(path: str, start: int, end: int, chunk: int = 64 * 1024):
    remaining = end - start + 1
    with open(path, "rb") as fh:
        fh.seek(start)
        while remaining > 0:
            data = fh.read(min(chunk, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


@router.get("", response_model=list[TrackResponse])
async def list_tracks(db: DbDep, mood: str | None = None) -> list[TrackResponse]:
    repo = SqlTrackRepo(db)
    return [_dto(t) for t in await repo.list(mood=mood)]


@router.get("/{track_id}", response_model=TrackResponse)
async def get_track(track_id: str, db: DbDep) -> TrackResponse:
    repo = SqlTrackRepo(db)
    rec = await repo.get(track_id)
    if rec is None:
        raise NotFoundError("track_not_found")
    return _dto(rec)


@router.get("/{track_id}/stream")
async def stream_track(
    track_id: str,
    request: Request,
    db: DbDep,
    storage: StorageDep,
):
    repo = SqlTrackRepo(db)
    rec = await repo.get(track_id)
    if rec is None:
        raise NotFoundError("track_not_found")

    local_path = storage.path_for(rec.file_key)
    if local_path is None:
        # S3-style backend: 302 to a presigned URL (Phase 6b will fill this in).
        url = await storage.get_url(key=rec.file_key)
        return RedirectResponse(url=url, status_code=302)

    exists = await anyio.to_thread.run_sync(os.path.exists, local_path)
    if not exists:
        raise NotFoundError("track_file_missing")

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
            media_type=rec.content_type or "audio/mpeg",
            headers=headers,
        )

    return FileResponse(
        local_path,
        media_type=rec.content_type or "audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )
