"""Idempotent sync of the R2 track catalog into the ``tracks`` table.

Imported by ``scripts/seed-dev-data.py`` (operator path) and by
``app.main`` lifespan (auto-seed on non-prod startup). Replaces the
"upload local seed-tracks/*.mp3 then insert" flow — audio bytes now
live in R2 and only metadata needs to land in the DB on each container
boot.

Self-healing:
  - Inserts entries whose ``file_key`` is not present.
  - Removes ``is_official`` rows whose ``file_key`` is no longer in any
    manifest (operator removed a track → DB shrinks to match).
  - Non-official user uploads are never touched.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.ids import UUID4Generator
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

# Fixed namespace for hashing the R2 ``file_key`` into a stable track UUID.
# Why deterministic: the StationCursor in Redis stores playlist track IDs;
# if these IDs were random UUID4s, any Postgres reseed (DB wiped while
# Redis volume survived) would leave the cursor pointing at ghost IDs and
# every ``/api/v1/tracks/{id}/play-token`` 404s. uuid5 of (NS, file_key)
# makes the same .mp3 always map to the same ``tracks.id`` across boots,
# deploys, and dev machines.
_TRACK_NAMESPACE = uuid.UUID("5e6b3c1f-7a4f-5b8e-9d2c-1a0b4c5d6e7f")


def deterministic_track_id(file_key: str) -> str:
    return str(uuid.uuid5(_TRACK_NAMESPACE, file_key))


def load_r2_manifest_entries(manifests_dir: Path) -> list[dict]:
    """Read every manifest JSON in ``manifests_dir`` and flatten the
    entries.

    Synchronous: a few small files on local disk. Kept separate from the
    async DB-sync below so ruff's ASYNC240 stays quiet (no pathlib calls
    inside the async function) and callers can swap in a different
    source (e.g. an S3 listing) without touching the DB code.
    """
    if not manifests_dir.exists():
        return []
    manifest_files = sorted(manifests_dir.glob("*.json"))
    entries: list[dict] = []
    for mf in manifest_files:
        entries.extend(json.loads(mf.read_text()))
    return entries


async def import_r2_track_catalog(
    db: Any,
    ids: UUID4Generator,
    entries: list[dict],
) -> dict[str, int]:
    """Sync the catalog. Returns ``{"inserted": n, "pruned": n, "total": n}``.

    Caller is responsible for loading ``entries`` (see
    ``load_r2_manifest_entries``) and committing the session; this
    function only issues SQL through ``db``.
    """
    if not entries:
        return {"inserted": 0, "pruned": 0, "total": 0}

    # System user owns the catalog — created on first run, reused after.
    system_user = (
        await db.execute(select(UserORM).where(UserORM.email == SEED_SYSTEM_USER_EMAIL))
    ).scalar_one_or_none()
    if system_user is None:
        system_user = UserORM(
            id=ids.new_id(),
            email=SEED_SYSTEM_USER_EMAIL,
            password_hash=hash_password("seed-system-no-login-3xpq8w"),
            display_name="Focus Town Seed",
            is_active=False,
        )
        db.add(system_user)
        await db.flush()

    desired_keys = {e["key"] for e in entries}
    # Prune scope = every is_official row whose file_key is not in the
    # current manifest set. Using is_official (not owner) catches stale
    # rows seeded by an earlier system user — observed on 2026-05-21
    # where a prior deploy left 5 ghost rows owned by a different UUID
    # for the same email after a re-deploy, so owner-scoped pruning
    # silently kept them attached to dead file_keys.
    existing_rows = (
        await db.execute(select(TrackORM).where(TrackORM.is_official.is_(True)))
    ).scalars().all()
    existing_keys = {r.file_key for r in existing_rows}

    pruned = 0
    for row in existing_rows:
        if row.file_key not in desired_keys:
            await db.delete(row)
            pruned += 1

    inserted = 0
    for entry in entries:
        if entry["key"] in existing_keys:
            continue
        filename = entry.get("filename") or entry["key"].rsplit("/", 1)[-1]
        title = title_override(filename, MOOD_MAP_DEFAULT) or derive_title(filename)
        mood = derive_mood(filename, MOOD_MAP_DEFAULT)
        db.add(
            TrackORM(
                id=deterministic_track_id(entry["key"]),
                title=title,
                artist=None,
                mood=mood,
                duration_ms=None,  # frontend defaults to 180s on NULL
                file_key=entry["key"],
                content_type="audio/mpeg",
                file_size_bytes=int(entry["size"]),
                license="royalty-free-seed",
                uploaded_by_user_id=system_user.id,
                is_official=True,
            )
        )
        inserted += 1

    return {"inserted": inserted, "pruned": pruned, "total": len(entries)}
