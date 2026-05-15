"""Unit tests for the storage backend factory.

The factory is the only place that knows about concrete adapters, so its
dispatch is what makes new backends safe to add without touching routers
or services (OCP). These tests pin the dispatch rules.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.infrastructure.storage.factory import make_storage
from app.infrastructure.storage.local import LocalFSStorage
from app.infrastructure.storage.s3 import S3Storage


def _settings(**overrides: object) -> Settings:
    # APP_SECRET_KEY / DATABASE_URL come from tests/conftest.py.
    return Settings(**overrides)  # type: ignore[call-arg]


def test_make_storage_local_returns_local_fs_storage(tmp_path):
    s = _settings(storage_backend="local", storage_root=str(tmp_path))
    storage = make_storage(s)
    assert isinstance(storage, LocalFSStorage)


def test_make_storage_s3_returns_s3_storage():
    s = _settings(
        storage_backend="s3",
        s3_bucket="test-bucket",
        s3_endpoint_url="http://minio:9000",
        s3_public_endpoint_url="http://localhost:9000",
        s3_access_key="minioadmin",
        s3_secret_key="minioadmin",
    )
    storage = make_storage(s)
    assert isinstance(storage, S3Storage)
    assert storage.bucket == "test-bucket"


def test_make_storage_s3_without_bucket_raises():
    s = _settings(storage_backend="s3", s3_bucket="")
    with pytest.raises(RuntimeError, match="non-empty bucket"):
        make_storage(s)


def test_make_storage_unknown_backend_raises():
    s = _settings(storage_backend="local")
    # Defensive: the Literal validator stops invalid values at the Settings
    # boundary, but make_storage must still fail loudly if a future code
    # path bypasses that validation. Mutate around the validator on purpose.
    object.__setattr__(s, "storage_backend", "gcs")  # type: ignore[arg-type]
    with pytest.raises(RuntimeError, match="unsupported storage_backend"):
        make_storage(s)
