#!/usr/bin/env python3
"""Bulk-upload MP3 files to a Cloudflare R2 bucket via the S3-compat API.

Idempotent: re-running with the same files is a no-op (skip via HEAD
check on the deterministic content-addressable key).

Two ways to authenticate:

1) Env vars (simplest, one-off):
    R2_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com \\
    R2_BUCKET=lowbatterytown-audio \\
    R2_ACCESS_KEY=... \\
    R2_SECRET_KEY=... \\
    python scripts/upload-tracks-to-r2.py <directory>

2) AWS-style profile in ``~/.aws/credentials`` (recommended for repeat use):
    # ~/.aws/credentials
    [lowbattery]
    aws_access_key_id = <R2 token id>
    aws_secret_access_key = <R2 token secret>

    R2_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com \\
    R2_BUCKET=lowbatterytown-audio \\
    python scripts/upload-tracks-to-r2.py --profile lowbattery <directory>

The script ONLY uploads bytes — it does NOT insert rows into the
`tracks` table. For DB registration drop the same MP3s into
`backend/assets/seed-tracks/` and run `backend/scripts/seed-dev-data.py`;
the seeder reads STORAGE_BACKEND and reuses these objects without
re-uploading (`storage.put` is also idempotent on R2).

Prints a JSON manifest on stdout: `[{path, key, size, sha256, status}, ...]`
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    print("ERROR: boto3 not installed. `pip install boto3`", file=sys.stderr)
    sys.exit(2)


KEY_PREFIX = "tracks/"
CACHE_CONTROL = "public, max-age=31536000, immutable"
SAFE_NAME = re.compile(r"[^a-zA-Z0-9._-]+")


def slugify(name: str) -> str:
    return SAFE_NAME.sub("-", name).strip("-").lower()


def sha256_hex(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def make_key(path: Path, digest: str) -> str:
    return f"{KEY_PREFIX}{digest[:12]}-{slugify(path.stem)}.mp3"


def env_or_die(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"ERROR: {name} env var is required", file=sys.stderr)
        sys.exit(2)
    return value


def _build_s3_client(endpoint: str, profile: str | None):
    """Construct a boto3 S3 client targeting R2.

    Profile takes precedence when supplied — credentials come from
    ``~/.aws/credentials [profile]``. Otherwise we read R2_ACCESS_KEY /
    R2_SECRET_KEY from the env. R2 is region-agnostic; boto3 still
    insists on *something*, so ``auto`` keeps it happy.
    """
    if profile:
        session = boto3.Session(profile_name=profile, region_name="auto")
        return session.client("s3", endpoint_url=endpoint)
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=env_or_die("R2_ACCESS_KEY"),
        aws_secret_access_key=env_or_die("R2_SECRET_KEY"),
        region_name="auto",
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="upload-tracks-to-r2",
        description="Bulk-upload MP3s to a Cloudflare R2 bucket.",
    )
    parser.add_argument("directory", help="Directory containing .mp3 files")
    parser.add_argument(
        "--profile",
        default=None,
        help="AWS-style profile name in ~/.aws/credentials (e.g. lowbattery)",
    )
    args = parser.parse_args(argv[1:])

    src_dir = Path(args.directory).expanduser().resolve()
    if not src_dir.is_dir():
        print(f"ERROR: {src_dir} is not a directory", file=sys.stderr)
        return 2

    endpoint = env_or_die("R2_ENDPOINT_URL")
    bucket = env_or_die("R2_BUCKET")

    s3 = _build_s3_client(endpoint, args.profile)

    mp3s = sorted(src_dir.glob("*.mp3"))
    if not mp3s:
        print(f"No .mp3 files found in {src_dir}", file=sys.stderr)
        return 1

    manifest: list[dict] = []
    for path in mp3s:
        digest = sha256_hex(path)
        key = make_key(path, digest)
        size = path.stat().st_size
        status = upload_if_missing(s3, bucket, key, path, size)
        manifest.append(
            {
                "path": str(path),
                "key": key,
                "size": size,
                "sha256": digest,
                "status": status,
            }
        )
        print(f"  [{status}] {path.name} -> {key} ({size} bytes)", file=sys.stderr)

    json.dump(manifest, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def upload_if_missing(s3, bucket: str, key: str, path: Path, size: int) -> str:
    try:
        head = s3.head_object(Bucket=bucket, Key=key)
        # Exists; trust it if the size matches (R2 ETag is content-hash
        # for non-multipart uploads, but boto3's HeadObject doesn't
        # always populate it identically, so size is the cheap heuristic).
        if head.get("ContentLength") == size:
            return "skip"
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code not in {"404", "NoSuchKey", "NotFound"}:
            raise

    with path.open("rb") as fh:
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=fh,
            ContentType="audio/mpeg",
            CacheControl=CACHE_CONTROL,
        )
    return "uploaded"


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
