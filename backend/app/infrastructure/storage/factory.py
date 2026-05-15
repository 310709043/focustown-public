"""Storage backend factory — single source of truth for IFileStorage dispatch.

The dispatch was originally inlined in app.core.deps:get_storage, but the dev
data seeder also needs to construct a storage backend without going through
FastAPI's Depends machinery. Extracting it keeps the dispatch rule in one
place (SRP) and lets every caller — routers, seed scripts, future workers —
depend on the IFileStorage Protocol rather than on a concrete adapter (DIP).

Adding a new backend (e.g. GCS, CloudFront) means one new branch here plus
the adapter module; routers, services, and seed scripts stay untouched (OCP).
"""

from __future__ import annotations

from app.core.config import Settings
from app.infrastructure.storage.base import IFileStorage
from app.infrastructure.storage.local import LocalFSStorage


def make_storage(settings: Settings) -> IFileStorage:
    backend = settings.storage_backend
    if backend == "local":
        return LocalFSStorage(settings.storage_root)
    if backend == "s3":
        # Imported lazily so the boto3 dependency is only paid when actually
        # using S3 — keeps local-dev / test cold start fast.
        from app.infrastructure.storage.s3 import S3Storage

        return S3Storage(
            bucket=settings.s3_bucket,
            region=settings.aws_region,
            endpoint_url=settings.s3_endpoint_url or None,
            public_endpoint_url=settings.s3_public_endpoint_url or None,
            access_key=settings.s3_access_key or None,
            secret_key=settings.s3_secret_key or None,
            presign_ttl_seconds=settings.s3_presign_ttl_seconds,
        )
    raise RuntimeError(f"unsupported storage_backend: {backend}")
