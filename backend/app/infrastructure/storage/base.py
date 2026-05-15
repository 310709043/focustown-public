from __future__ import annotations

from typing import Protocol


class IFileStorage(Protocol):
    """Blob storage seam used by uploads and the streaming endpoint.

    The interface is intentionally narrow: only the three operations the
    track router actually performs. Adding methods here means every adapter
    (local FS, S3, future GCS/CloudFront) must implement them, so keep new
    methods out unless every backend can sensibly support them.

    Method responsibilities:
      - ``put``        — write-only. Persist bytes under ``key`` and return
                         a retrievable reference (file:// URL for local,
                         presigned https URL for S3). Idempotent on repeat
                         calls with the same key (callers rely on this for
                         seed-on-startup).
      - ``get_url``    — read-time URL resolution. ``ttl_seconds`` is a hint
                         for backends that issue time-limited URLs; local
                         backends are free to ignore it.
      - ``path_for``   — backend capability discriminator. Returns a local
                         filesystem path the FastAPI router can serve via
                         FileResponse, or ``None`` when the backend can
                         only be reached over HTTP (caller falls back to
                         a 302 redirect through ``get_url``). MUST be a
                         pure, side-effect-free check — no I/O — because
                         the streaming endpoint calls it on every request.
    """

    async def put(self, *, key: str, data: bytes, content_type: str) -> str: ...

    async def get_url(self, *, key: str, ttl_seconds: int = 3600) -> str: ...

    def path_for(self, key: str) -> str | None: ...
