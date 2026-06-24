"""Seed N load-test users for k6 + chaos drills.

Creates ``load-test-001 .. load-test-NNN`` with a shared password so
``tests/load/match_queue.js`` can authenticate without /signup overhead
(bcrypt cost on signup would dominate the timing signal we want to
measure for the matching queue).

Idempotent: re-running emits ``ON CONFLICT DO NOTHING`` on the unique
``email`` column (same pattern as ``backend/scripts/seed-dev-data.py``
bot seeding). Drop the existing test users with the companion
``--delete`` flag.

Usage (inside the backend container):
    docker compose exec backend python /app/scripts/seed-load-users.py
    docker compose exec backend python /app/scripts/seed-load-users.py --count 50
    docker compose exec backend python /app/scripts/seed-load-users.py --delete

Or locally with backend env exported:
    python backend/scripts/seed-load-users.py --count 100
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR: Path | None = None
for candidate in (
    SCRIPT_DIR.parent,
    SCRIPT_DIR.parent / "backend",
    Path("/app"),
):
    if (candidate / "app" / "core" / "config.py").exists():
        BACKEND_DIR = candidate
        break
if BACKEND_DIR is None:
    raise RuntimeError(
        f"seed-load-users.py could not locate backend/app from {SCRIPT_DIR}"
    )
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete  # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.ids import UUID4Generator  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.infrastructure.db.models.user import UserORM  # noqa: E402
from app.infrastructure.db.session import get_session_factory  # noqa: E402

# NB: non-reserved TLD required — these users sign in through the API, and
# pydantic EmailStr (email-validator 2.x) rejects `.local` as special-use,
# which 422s the signin. Keep this in sync with tests/load/match_queue.js.
EMAIL_FMT = "load-test-{n:03d}@loadtest.lowbatterytown.com"
PASSWORD = "Loadtest123!"  # noqa: S105 — fixed dev/test fixture, not a secret
TERMS_VERSION = "2026-05-14"
DEFAULT_COUNT = 100


def email_for(n: int) -> str:
    return EMAIL_FMT.format(n=n)


async def seed(count: int) -> None:
    settings = get_settings()
    factory = get_session_factory(settings.database_url)
    ids = UUID4Generator()
    now = datetime.now(UTC)

    # One bcrypt hash for all VUs — the password is shared. Computing
    # 100x is pointless and slows the seed by ~30s on a laptop.
    shared_hash = hash_password(PASSWORD)

    rows = [
        {
            "id": ids.new_id(),
            "email": email_for(n),
            "password_hash": shared_hash,
            "display_name": f"LoadTest{n:03d}",
            "character_key": "luna",
            "role_label": "load tester",
            "is_active": True,
            "is_bot": False,
            "terms_accepted_at": now,
            "terms_version": TERMS_VERSION,
        }
        for n in range(1, count + 1)
    ]

    async with factory() as db:
        await db.execute(
            pg_insert(UserORM)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["email"])
        )
        await db.commit()
    print(f"✓ ensured {count} load-test users (load-test-001 .. load-test-{count:03d})")


async def purge(count: int) -> None:
    settings = get_settings()
    factory = get_session_factory(settings.database_url)
    emails = [email_for(n) for n in range(1, count + 1)]
    async with factory() as db:
        await db.execute(delete(UserORM).where(UserORM.email.in_(emails)))
        await db.commit()
    print(f"✓ purged load-test users 1..{count}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--count",
        type=int,
        default=DEFAULT_COUNT,
        help=f"number of load-test users to seed (default {DEFAULT_COUNT})",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="purge the load-test users (uses --count to bound the range)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.count < 1 or args.count > 10_000:
        raise SystemExit("--count must be in [1, 10000]")
    if args.delete:
        asyncio.run(purge(args.count))
    else:
        asyncio.run(seed(args.count))
