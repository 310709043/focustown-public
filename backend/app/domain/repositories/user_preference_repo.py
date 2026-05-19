from __future__ import annotations

from typing import Any, Protocol


class IUserPreferenceRepo(Protocol):
    """Generic JSONB key/value store keyed by (user, key).

    The Protocol stays minimal because the upstream service does all
    the type-shape validation. The repo is a dumb upsert / bulk-read.
    """

    async def list_for_user(self, user_id: str) -> dict[str, Any]:
        """Return ``{key: value}`` for the user. Missing keys map to
        whatever the service's defaults table says — repo doesn't fill
        defaults so the storage layer stays simple."""

    async def upsert_many(
        self,
        *,
        user_id: str,
        entries: dict[str, Any],
        id_factory: "callable[[], str]",
    ) -> None:
        """Upsert each (user, key) → value. Caller validates shapes.
        ``id_factory`` mints ids for new rows."""
