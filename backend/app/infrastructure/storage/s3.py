from __future__ import annotations

from app.infrastructure.storage.base import IFileStorage


class S3Storage(IFileStorage):
    """Placeholder for v2. Use boto3 + presigned URLs."""

    def __init__(self, bucket: str, region: str) -> None:
        self._bucket = bucket
        self._region = region

    async def put(self, *, key: str, data: bytes, content_type: str) -> str:  # noqa: ARG002
        raise NotImplementedError("S3Storage.put — implement in v2")

    async def get_url(self, *, key: str, ttl_seconds: int = 3600) -> str:  # noqa: ARG002
        raise NotImplementedError("S3Storage.get_url — implement in v2")
