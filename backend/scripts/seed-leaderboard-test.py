"""Seed today's focus sessions for leaderboard testing.

Run inside the backend container:
    docker compose exec backend python /app/../scripts/seed-leaderboard-test.py

Or locally:
    python scripts/seed-leaderboard-test.py
"""
from __future__ import annotations

import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

# Path setup (same as seed-dev-data.py)
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR: Path | None = None
for candidate in (SCRIPT_DIR.parent, SCRIPT_DIR.parent / "backend", Path("/app")):
    if (candidate / "app" / "core" / "config.py").exists():
        BACKEND_DIR = candidate
        break
if BACKEND_DIR is None:
    raise RuntimeError("Could not locate backend/app")
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.ids import UUID4Generator  # noqa: E402
from app.infrastructure.db.models.focus_session import FocusSessionORM  # noqa: E402
from app.infrastructure.db.models.user import UserORM  # noqa: E402
from app.infrastructure.db.session import get_session_factory  # noqa: E402

# Test users with varying focus durations
TEST_DATA = [
    # (display_name, sessions_count, avg_duration_minutes)
    ("Alice", 4, 25),
    ("Bob", 3, 20),
    ("Charlie", 2, 30),
    ("Diana", 5, 15),
    ("Eve", 1, 25),
]


async def main() -> None:
    settings = get_settings()
    ids = UUID4Generator()
    factory = get_session_factory(settings.database_url)

    async with factory() as db:
        now = datetime.now(UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        created = 0
        for display_name, session_count, avg_minutes in TEST_DATA:
            # Find or create user
            result = await db.execute(
                select(UserORM).where(UserORM.display_name == display_name)
            )
            user = result.scalar_one_or_none()

            if user is None:
                # Create test user
                user_id = ids.new_id()
                email = f"{display_name.lower()}@test.local"
                user = UserORM(
                    id=user_id,
                    email=email,
                    display_name=display_name,
                    password_hash="!",  # noqa: S106
                    is_active=True,
                    is_bot=False,
                )
                db.add(user)
                await db.flush()
                print(f"  Created user: {display_name} ({user_id})")

            # Create focus sessions for today
            for _ in range(session_count):
                # Random time between midnight and now
                seconds_today = int((now - today_start).total_seconds())
                random_offset = random.randint(0, max(0, seconds_today - 1800))  # noqa: S311
                started_at = today_start + timedelta(seconds=random_offset)

                duration = avg_minutes * 60 + random.randint(-300, 300)  # noqa: S311
                duration = max(300, duration)  # Min 5 minutes

                session_id = ids.new_id()
                session = FocusSessionORM(
                    id=session_id,
                    user_id=user.id,
                    mode="focus",
                    duration_seconds=duration,
                    elapsed_seconds=duration,
                    status="completed",
                    started_at=started_at,
                    ended_at=started_at + timedelta(seconds=duration),
                )
                db.add(session)
                created += 1

        await db.commit()
        print(f"\nSeeded {created} focus sessions for today's leaderboard.")
        print("Refresh https://dev.lowbatterytown.com/en/town to see results.")


if __name__ == "__main__":
    asyncio.run(main())
