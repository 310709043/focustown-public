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


# ----- ensure_cors_policy -----------------------------------------------------
# Four-quadrant coverage (logic / boundary / error / object-state) for the
# CORS policy that unblocks <audio> tags loading presigned URLs from a
# cross-origin S3 host. See app/infrastructure/storage/s3.py for the symptom
# this fix targets.


def test_ensure_cors_policy_sends_get_and_head_with_browser_origin():
    """logic: a non-empty origin list ends up verbatim in the AWS call."""
    storage = _make_storage()
    stubber = Stubber(storage._internal)  # type: ignore[attr-defined]
    stubber.add_response(
        "put_bucket_cors",
        {},
        expected_params={
            "Bucket": "test-bucket",
            "CORSConfiguration": {
                "CORSRules": [
                    {
                        "AllowedMethods": ["GET", "HEAD"],
                        "AllowedOrigins": ["https://dev.lowbatterytown.com"],
                        "AllowedHeaders": ["Range", "If-Range", "If-None-Match"],
                        "ExposeHeaders": [
                            "Accept-Ranges",
                            "Content-Range",
                            "Content-Length",
                            "ETag",
                        ],
                        "MaxAgeSeconds": 3600,
                    }
                ]
            },
        },
    )
    with stubber:
        storage.ensure_cors_policy(
            allowed_origins=["https://dev.lowbatterytown.com"]
        )
    stubber.assert_no_pending_responses()


def test_ensure_cors_policy_empty_origins_falls_back_to_wildcard():
    """boundary: an empty list collapses to ['*'] rather than rejecting the
    config — fail-open is preferred over fail-silent for an audio-only bucket
    that holds no private data."""
    storage = _make_storage()
    stubber = Stubber(storage._internal)  # type: ignore[attr-defined]
    stubber.add_response(
        "put_bucket_cors",
        {},
        expected_params={
            "Bucket": "test-bucket",
            "CORSConfiguration": {
                "CORSRules": [
                    {
                        "AllowedMethods": ["GET", "HEAD"],
                        "AllowedOrigins": ["*"],
                        "AllowedHeaders": ["Range", "If-Range", "If-None-Match"],
                        "ExposeHeaders": [
                            "Accept-Ranges",
                            "Content-Range",
                            "Content-Length",
                            "ETag",
                        ],
                        "MaxAgeSeconds": 3600,
                    }
                ]
            },
        },
    )
    with stubber:
        storage.ensure_cors_policy(allowed_origins=[])


def test_ensure_cors_policy_propagates_access_denied_error():
    """error: when the IAM role lacks s3:PutBucketCORS, the ClientError must
    propagate so the caller (main.py lifespan / seed script) can log it. The
    method itself does not swallow — callers decide whether to crash."""
    from botocore.exceptions import ClientError

    storage = _make_storage()
    stubber = Stubber(storage._internal)  # type: ignore[attr-defined]
    stubber.add_client_error(
        "put_bucket_cors",
        service_error_code="AccessDenied",
        service_message="Access Denied",
        http_status_code=403,
    )
    with stubber, pytest.raises(ClientError):
        storage.ensure_cors_policy(allowed_origins=["https://example.com"])


def test_ensure_cors_policy_is_idempotent_across_calls():
    """object-state: two consecutive calls each issue a fresh put_bucket_cors
    (idempotent at the API level — put overwrites the rule set)."""
    storage = _make_storage()
    stubber = Stubber(storage._internal)  # type: ignore[attr-defined]
    stubber.add_response("put_bucket_cors", {})
    stubber.add_response("put_bucket_cors", {})
    with stubber:
        storage.ensure_cors_policy(allowed_origins=["https://example.com"])
        storage.ensure_cors_policy(allowed_origins=["https://example.com"])
    stubber.assert_no_pending_responses()
