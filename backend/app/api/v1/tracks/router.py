from __future__ import annotations

import os
from pathlib import Path

import anyio.to_thread
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from starlette.status import HTTP_416_RANGE_NOT_SATISFIABLE

from app.api.v1.tracks.schemas import TrackResponse, TrackUploadMeta
from app.core.deps import CurrentUserId, DbDep, IdGenDep, SettingsDep, StorageDep
from app.core.exceptions import (
    BusinessError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.domain.repositories.track_repo import TrackRecord
from app.infrastructure.db.repositories import SqlTrackRepo

router = APIRouter()

_MP3_MAGIC_PREFIXES = (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2", b"\xff\xfa")
_ALLOWED_CONTENT_TYPES = {"audio/mpeg", "audio/mp3"}


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


def _looks_like_mp3(head: bytes) -> bool:
    return any(head.startswith(magic) for magic in _MP3_MAGIC_PREFIXES)


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


@router.post("", response_model=TrackResponse, status_code=201)
async def upload_track(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    settings: SettingsDep,
    storage: StorageDep,
    title: str = Form(..., min_length=1, max_length=255),
    mood: str = Form(..., min_length=1, max_length=32),
    artist: str | None = Form(default=None, max_length=255),
    license: str | None = Form(default=None, max_length=64),
    file: UploadFile = File(...),  # noqa: B008
) -> TrackResponse:
    # Schema-level validation (re-uses pydantic constraints).
    meta = TrackUploadMeta(title=title, artist=artist, mood=mood, license=license)

    if file.content_type and file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="unsupported_media_type")

    # Quota: count first to fail fast before any disk I/O.
    repo = SqlTrackRepo(db)
    existing = await repo.count_by_uploader(user_id)
    if existing >= settings.tracks_max_per_user:
        raise BusinessError("track_quota_exceeded")

    # Read with a hard cap to avoid OOM on hostile payloads.
    max_bytes = settings.tracks_max_file_size_mb * 1024 * 1024
    # +1 so we can detect "exactly at limit + 1 byte" without ambiguity.
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValidationError("file_too_large")
    if not data:
        raise ValidationError("empty_file")
    if not _looks_like_mp3(data[:4]):
        raise HTTPException(status_code=415, detail="not_an_mp3")

    track_id = ids.new_id()
    file_key = f"tracks/{track_id}.mp3"
    await storage.put(
        key=file_key,
        data=data,
        content_type=file.content_type or "audio/mpeg",
    )

    rec = await repo.insert(
        track_id=track_id,
        title=meta.title,
        artist=meta.artist,
        mood=meta.mood,
        duration_ms=None,
        file_key=file_key,
        content_type=file.content_type or "audio/mpeg",
        file_size_bytes=len(data),
        license=meta.license,
        uploaded_by_user_id=user_id,
    )
    return _dto(rec)


@router.delete("/{track_id}", status_code=204)
async def delete_track(
    track_id: str,
    user_id: CurrentUserId,
    db: DbDep,
    storage: StorageDep,
) -> None:
    repo = SqlTrackRepo(db)
    rec = await repo.get(track_id)
    if rec is None:
        raise NotFoundError("track_not_found")
    if rec.uploaded_by_user_id != user_id:
        raise ForbiddenError("track_not_owned")
    await repo.delete(track_id=track_id, user_id=user_id)
    # Best-effort cleanup of the underlying file. We swallow errors so a
    # missing/relocated blob can't block DB deletion.
    local_path = storage.path_for(rec.file_key)
    if local_path:
        def _unlink(p: str) -> None:
            try:
                Path(p).unlink(missing_ok=True)
            except OSError:
                pass

        await anyio.to_thread.run_sync(_unlink, local_path)
