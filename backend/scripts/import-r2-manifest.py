#!/usr/bin/env python3
"""Insert R2-uploaded tracks into the `tracks` table from an upload manifest.

The manifest is produced by `scripts/upload-tracks-to-r2.py` and lists
every MP3 already pushed to R2 with its content-addressed object key.
This script registers those objects as playable tracks so
`/api/v1/tracks/{id}/play-token` can sign URLs for them.

Idempotency: skips rows whose `file_key` already exists (unique
constraint on `tracks.file_key`).

Reset mode (`--reset-seed`): deletes every track owned by the seed-
system user before inserting. Use this when migrating storage backends
(e.g. AWS S3 → R2) so old DB rows pointing at dead file_keys are
cleared. **Does not touch non-seed user uploads.**

Usage:
    DATABASE_URL=postgresql+asyncpg://... \\
      python backend/scripts/import-r2-manifest.py \\
        --manifest backend/data/r2-manifest-2026-05-21.json \\
        [--reset-seed] [--dry-run]

The script is a sibling of `seed-dev-data.py` and reuses its system
user pattern + duration extraction. It is operator-driven (one-time
per upload batch), not part of container startup.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Make `app.*` imports resolve when running from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.infrastructure.db.models.track import TrackORM
from app.infrastructure.db.models.user import UserORM
from app.infrastructure.db.seed.r2_helpers import (
    MOOD_MAP_DEFAULT,
    SEED_SYSTEM_USER_EMAIL,
    derive_mood,
    derive_title,
    title_override,
)


def mp3_duration_ms(path: Path) -> int | None:
    if not path.exists():
        return None
    try:
        from mutagen.mp3 import MP3  # type: ignore[import-untyped]

        info = MP3(str(path)).info
        return int(info.length * 1000) if info.length > 0 else None
    except Exception:
        return None


async def ensure_system_user(session: AsyncSession) -> UserORM:
    import uuid

    existing = (
        await session.execute(select(UserORM).where(UserORM.email == SEED_SYSTEM_USER_EMAIL))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    user = UserORM(
        id=str(uuid.uuid4()),
        email=SEED_SYSTEM_USER_EMAIL,
        password_hash=hash_password("seed-system-no-login-3xpq8w"),
        display_name="Focus Town Seed",
        is_active=False,
    )
    session.add(user)
    await session.flush()
    return user


async def reset_seed_tracks(session: AsyncSession, system_user_id: str) -> int:
    """Delete every track owned by the seed system user."""
    result = await session.execute(
        delete(TrackORM).where(TrackORM.uploaded_by_user_id == system_user_id)
    )
    return result.rowcount or 0


async def import_one(
    session: AsyncSession,
    entry: dict,
    system_user_id: str,
    mood_map: dict[str, dict[str, str]],
) -> tuple[str, str]:
    """Return (status, message) where status ∈ {'inserted', 'skipped'}."""
    file_key = entry["key"]

    # Idempotent: skip if a row with this file_key already exists.
    existing = (
        await session.execute(select(TrackORM).where(TrackORM.file_key == file_key))
    ).scalar_one_or_none()
    if existing is not None:
        return "skipped", f"{file_key} (already in DB as id={existing.id})"

    # Two shapes supported:
    #   - Operator-local: {path: "/abs/path/to/file.mp3", ...} — has the
    #     bytes locally so mutagen can read duration.
    #   - Committed sanitized: {filename: "file.mp3", ...} — paths
    #     stripped so the manifest is repo-safe; duration falls back
    #     to NULL (frontend defaults to 180s).
    raw_path = entry.get("path")
    filename = entry.get("filename") or (
        Path(raw_path).name if raw_path else entry["key"].rsplit("/", 1)[-1]
    )
    src_path = Path(raw_path) if raw_path else None
    title = title_override(filename, mood_map) or derive_title(filename)
    mood = derive_mood(filename, mood_map)
    duration_ms = mp3_duration_ms(src_path) if src_path else None

    import uuid

    track = TrackORM(
        id=str(uuid.uuid4()),
        title=title,
        artist=None,
        mood=mood,
        duration_ms=duration_ms,
        file_key=file_key,
        content_type="audio/mpeg",
        file_size_bytes=int(entry["size"]),
        license="royalty-free-seed",
        uploaded_by_user_id=system_user_id,
        is_official=True,
    )
    session.add(track)
    await session.flush()
    return "inserted", f"{file_key} → '{title}' ({mood}, {duration_ms}ms)"


async def run(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest).expanduser().resolve()  # noqa: ASYNC240 — CLI script
    if not manifest_path.exists():
        print(f"ERROR: manifest not found at {manifest_path}", file=sys.stderr)
        return 2
    manifest = json.loads(manifest_path.read_text())
    if not isinstance(manifest, list) or not manifest:
        print("ERROR: manifest must be a non-empty list", file=sys.stderr)
        return 2

    mood_map = dict(MOOD_MAP_DEFAULT)
    if args.mood_map:
        override_text = Path(args.mood_map).read_text()  # noqa: ASYNC240 — CLI script
        mood_map.update(json.loads(override_text))

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("ERROR: DATABASE_URL env var is required", file=sys.stderr)
        return 2

    engine = create_async_engine(database_url, future=True)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    counters = {"inserted": 0, "skipped": 0, "reset": 0}

    async with session_factory() as session:
        system_user = await ensure_system_user(session)
        if args.reset_seed:
            counters["reset"] = await reset_seed_tracks(session, system_user.id)
            print(f"  [reset] deleted {counters['reset']} seed-owned track rows",
                  file=sys.stderr)

        for entry in manifest:
            try:
                status, message = await import_one(
                    session, entry, system_user.id, mood_map
                )
            except Exception as e:
                print(f"  [error] {entry.get('key', '?')}: {e}", file=sys.stderr)
                continue
            counters[status] = counters.get(status, 0) + 1
            print(f"  [{status}] {message}", file=sys.stderr)

        if args.dry_run:
            print("  (dry-run) rolling back", file=sys.stderr)
            await session.rollback()
        else:
            await session.commit()

    await engine.dispose()
    print(
        f"\nDone. inserted={counters['inserted']}, "
        f"skipped={counters['skipped']}, reset={counters['reset']}, "
        f"total_in_manifest={len(manifest)}",
        file=sys.stderr,
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="import-r2-manifest",
        description="Insert R2 tracks from an upload manifest into the DB.",
    )
    parser.add_argument(
        "--manifest", required=True, help="Path to upload manifest JSON."
    )
    parser.add_argument(
        "--mood-map",
        default=None,
        help="Optional JSON file mapping filename → {title, mood} overrides.",
    )
    parser.add_argument(
        "--reset-seed",
        action="store_true",
        help=(
            "DELETE existing seed-owned tracks before inserting "
            "(use after switching storage backends)."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Roll back the transaction at the end (no DB changes persisted).",
    )
    args = parser.parse_args()
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
