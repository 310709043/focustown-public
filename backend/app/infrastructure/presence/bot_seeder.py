"""Bot presence seeder — keeps NPC users visible on the town street.

Bots never connect via WebSocket, so they would otherwise be invisible to
``PresenceService.list_street()`` which projects only the Redis presence
tracker. The seeder writes each bot into the tracker with
``state="on_street"`` and a status that rotates between ``focusing`` and
``chilling`` per bot key, then relies on the worker's 60-second refresh
loop to keep the 90-second TTL alive.

SOLID notes:

- **Single Responsibility**: this module only writes bots into the
  presence tracker. It does not create / mutate user rows, does not
  publish realtime events, does not touch matching.
- **Dependency Inversion**: depends on the ``IUserReader`` and
  ``IPresenceTracker`` Protocols rather than concrete adapters, so the
  same coroutine works against the Redis impl in prod and the in-memory
  fake used by tests.
- **Interface Segregation**: takes ``IUserReader`` (read-only) — the
  seeder never needs to create or update users.
"""

from __future__ import annotations

from app.core.logging import get_logger
from app.domain.repositories.presence import IPresenceTracker
from app.domain.repositories.user_repo import IUserReader

log = get_logger(__name__)


_BOT_STATUSES: tuple[str, ...] = ("focusing", "chilling")


def _status_for(bot_id: str) -> str:
    """Deterministic status per bot — same id always maps to same status."""
    return _BOT_STATUSES[hash(bot_id) % len(_BOT_STATUSES)]


async def refresh_bot_presence(
    *,
    reader: IUserReader,
    tracker: IPresenceTracker,
) -> int:
    """Write every bot user into the presence tracker as ``on_street``.

    Returns the number of bots refreshed. Safe to call repeatedly — each
    invocation extends the per-user TTL atomically inside
    ``RedisPresenceTracker.online``.
    """
    bots = await reader.list_bots()
    for bot in bots:
        await tracker.online(
            bot.id,
            state="on_street",
            status=_status_for(bot.id),
        )
    if bots:
        log.info("refresh_bot_presence", count=len(bots))
    return len(bots)
