"""Personal radio playlist service.

Returns a per-user, per-context, per-day deterministic shuffle of the
official track catalog. Two listeners NEVER see the same ordering
because ``user_id`` is part of the seed. The same listener entering
the same context on the same day sees the same ordering on every
refresh (so "I liked the third song" still works after F5).

SOLID:
- S: only computes orderings — track storage / URL resolution / HTTP
  framing live elsewhere.
- O: a new context literal (``"matched"``, ``"library"``) is one line
  in the validator; the seed formula stays untouched.
- L: ``ITrackRepo`` and ``IClock`` are both already used by other
  services; their fakes apply here unchanged.
- I: depends on the existing narrow ``ITrackRepo`` Protocol, not on a
  mega-port.
- D: framework-free; tests use ``FakeClock`` + an in-memory track repo.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from typing import Literal

from app.core.clock import IClock
from app.core.exceptions import BusinessError
from app.domain.repositories.track_repo import ITrackRepo, TrackRecord

PlaylistContext = Literal["city", "focus", "room"]
_ALLOWED_CONTEXTS: frozenset[str] = frozenset({"city", "focus", "room"})


@dataclass(slots=True)
class PlaylistService:
    tracks: ITrackRepo
    clock: IClock

    async def get_personal_playlist(
        self,
        *,
        user_id: str,
        context: str,
        context_id: str | None = None,
    ) -> list[TrackRecord]:
        """Return today's randomized order for ``user_id`` in ``context``.

        - ``context``: one of {"city", "focus", "room"}.
        - ``context_id``: optional fine-grained discriminator
          (e.g. focus session id, room id) so different rooms give
          different orderings without leaking that they share a
          catalog. Falls back to the context label when omitted.
        """
        if context not in _ALLOWED_CONTEXTS:
            raise BusinessError("unknown_context")
        catalog = await self.tracks.list_official()
        if not catalog:
            return []
        seed = self._seed(
            user_id=user_id,
            context=context,
            context_id=context_id or context,
            day=self._day(),
        )
        ordered = list(catalog)
        # ``random.Random`` is the right call here: we need a
        # reproducible per-(user,context,day) shuffle, not crypto
        # randomness. Suppress S311 explicitly.
        random.Random(seed).shuffle(ordered)  # noqa: S311
        return ordered

    def _day(self) -> str:
        """Server-local date as ``YYYY-MM-DD`` — refreshed daily."""
        return self.clock.now().date().isoformat()

    @staticmethod
    def _seed(
        *,
        user_id: str,
        context: str,
        context_id: str,
        day: str,
    ) -> int:
        material = f"{user_id}|{context}|{context_id}|{day}".encode()
        digest = hashlib.sha256(material).digest()
        # int.from_bytes(8) gives an unsigned 64-bit seed — random.Random
        # accepts any non-negative int.
        return int.from_bytes(digest[:8], byteorder="big")
