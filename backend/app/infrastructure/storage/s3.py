"""S3 / MinIO adapter implementing IFileStorage.

The adapter is dual-client: an internal client (configured against
``endpoint_url``) is used for blob uploads from inside the cluster, and a
public client (configured against ``public_endpoint_url``) is used to mint
presigned URLs whose Host points at a name reachable from the browser. In
docker compose terms the internal endpoint is ``http://minio:9000`` while
the public one is ``http://localhost:9000``; MinIO does not include the
Host header in its signing scope so the swap is legal.

When both endpoint URLs are blank (the typical production AWS deploy) the
two clients collapse onto boto3's default endpoint resolution, and
credentials fall back to the standard provider chain (IAM role, env vars,
~/.aws). This keeps the local-MinIO knobs strictly opt-in and prevents the
adapter from accidentally drifting into production behaviour just because
dev exercises the same code path.
"""

from __future__ import annotations

import asyncio
from typing import Any

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.infrastructure.storage.base import IFileStorage


class S3Storage(IFileStorage):
    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        endpoint_url: str | None = None,
        public_endpoint_url: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        presign_ttl_seconds: int = 3600,
    ) -> None:
        if not bucket:
            raise RuntimeError("S3Storage requires a non-empty bucket name")
        self._bucket = bucket
        self._region = region
        self._presign_ttl_seconds = presign_ttl_seconds

        # path-style addressing is required for MinIO (which serves buckets
        # as URL path components) and harmless for real S3 endpoints.
        s3_config = Config(signature_version="s3v4", s3={"addressing_style": "path"})

        creds: dict[str, Any] = {}
        if access_key and secret_key:
            creds["aws_access_key_id"] = access_key
            creds["aws_secret_access_key"] = secret_key

        self._internal = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            config=s3_config,
            **creds,
        )
        # Reuse the internal client for presigning when there's no
        # distinct public endpoint; otherwise build a separate client
        # bound to the browser-reachable host.
        if public_endpoint_url and public_endpoint_url != endpoint_url:
            self._public = boto3.client(
                "s3",
                region_name=region,
                endpoint_url=public_endpoint_url,
                config=s3_config,
                **creds,
            )
        else:
            self._public = self._internal

    @property
    def bucket(self) -> str:
        return self._bucket

    async def put(self, *, key: str, data: bytes, content_type: str) -> str:
        # boto3 is sync; offload to a worker thread so the FastAPI event
        # loop isn't blocked by an upload.
        def _put() -> None:
            self._internal.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )

        await asyncio.to_thread(_put)
        return await self.get_url(key=key, ttl_seconds=self._presign_ttl_seconds)

    async def get_url(self, *, key: str, ttl_seconds: int = 3600) -> str:
        def _presign() -> str:
            return self._public.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=ttl_seconds,
            )

        return await asyncio.to_thread(_presign)

    def path_for(self, key: str) -> str | None:
        # S3 / MinIO cannot be served as a local file — the streaming
        # router uses this to switch to a 302-redirect path that hands
        # the browser a presigned URL instead.
        _ = key
        return None

    def ensure_bucket(self) -> None:
        """Create the bucket if it doesn't already exist. Idempotent.

        Used by the dev data seeder so a fresh ``docker compose up`` against
        MinIO doesn't fail before any uploads happen. Not part of the
        IFileStorage protocol because creating buckets is a backend-specific
        operation that has no analogue in LocalFSStorage (the directory is
        created on construction).
        """
        try:
            self._internal.head_bucket(Bucket=self._bucket)
            return
        except ClientError as exc:
            # 404 / NoSuchBucket → fall through and create.
            # 403 → bucket exists but we lack permissions; surface that.
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"403", "AccessDenied"}:
                raise
        try:
            if self._region and self._region != "us-east-1":
                self._internal.create_bucket(
                    Bucket=self._bucket,
                    CreateBucketConfiguration={"LocationConstraint": self._region},
                )
            else:
                self._internal.create_bucket(Bucket=self._bucket)
        except ClientError as exc:
            # Tolerate races where another seeder created the bucket between
            # head_bucket and create_bucket. Any other error is propagated.
            code = exc.response.get("Error", {}).get("Code", "")
            if code not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
                raise
