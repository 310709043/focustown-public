"""Unit tests for S3Storage using botocore.stub.Stubber.

These exercise the adapter against the boto3 client surface without
touching a real MinIO / S3 endpoint, so they're safe in CI. End-to-end
verification against MinIO is in the manual docker-compose run described
in the plan file.
"""

from __future__ import annotations

import pytest
from botocore.stub import Stubber

from app.infrastructure.storage.s3 import S3Storage


def _make_storage(**overrides) -> S3Storage:
    kwargs = {
        "bucket": "test-bucket",
        "region": "ap-northeast-1",
        "endpoint_url": "http://minio:9000",
        "public_endpoint_url": "http://localhost:9000",
        "access_key": "minioadmin",
        "secret_key": "minioadmin",
        "presign_ttl_seconds": 3600,
    }
    kwargs.update(overrides)
    return S3Storage(**kwargs)


async def test_put_calls_put_object_with_expected_params():
    storage = _make_storage()
    stubber = Stubber(storage._internal)  # type: ignore[attr-defined]
    stubber.add_response(
        "put_object",
        {},
        expected_params={
            "Bucket": "test-bucket",
            "Key": "tracks/abc.mp3",
            "Body": b"id3\x03data",
            "ContentType": "audio/mpeg",
        },
    )
    with stubber:
        url = await storage.put(
            key="tracks/abc.mp3", data=b"id3\x03data", content_type="audio/mpeg"
        )
    # put() returns the presigned URL via get_url(); MinIO presigned URLs
    # start with the public_endpoint_url and embed the AWS query params.
    assert url.startswith("http://localhost:9000/test-bucket/tracks/abc.mp3")
    assert "X-Amz-Signature=" in url


async def test_get_url_returns_presigned_url_pointing_at_public_endpoint():
    storage = _make_storage()
    url = await storage.get_url(key="tracks/xyz.mp3", ttl_seconds=600)
    assert url.startswith("http://localhost:9000/test-bucket/tracks/xyz.mp3")
    assert "X-Amz-Expires=600" in url


async def test_get_url_uses_internal_endpoint_when_no_public_override():
    storage = _make_storage(public_endpoint_url=None)
    url = await storage.get_url(key="tracks/xyz.mp3")
    # Falls back to the only configured endpoint.
    assert url.startswith("http://minio:9000/test-bucket/tracks/xyz.mp3")


def test_path_for_always_returns_none():
    storage = _make_storage()
    assert storage.path_for("anything") is None


def test_constructor_rejects_empty_bucket():
    with pytest.raises(RuntimeError, match="non-empty bucket"):
        _make_storage(bucket="")


def test_ensure_bucket_swallows_errors_on_existing_bucket():
    storage = _make_storage()
    stubber = Stubber(storage._internal)  # type: ignore[attr-defined]
    stubber.add_response("head_bucket", {}, expected_params={"Bucket": "test-bucket"})
    with stubber:
        storage.ensure_bucket()  # no exception, returns cleanly
