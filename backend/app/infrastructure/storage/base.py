from __future__ import annotations

from typing import Protocol


class IFileStorage(Protocol):
    async def put(self, *, key: str, data: bytes, content_type: str) -> str:
        """Store bytes and return a retrievable URL (local file:// or s3 signed URL)."""
        ...

    async def get_url(self, *, key: str, ttl_seconds: int = 3600) -> str: ...

    def path_for(self, key: str) -> str | None:
        """Return a local filesystem path for the key, or None if the
        backend cannot serve raw bytes locally (e.g. S3 — caller should
        redirect to a presigned URL instead). The streaming endpoint uses
        this to switch between FileResponse and HTTP redirect.
        """
        ...
