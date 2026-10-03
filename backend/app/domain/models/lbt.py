"""LowBatteryTown domain models.

Anonymous guests (no user account) are paired 1:1 for a fixed window.
These dataclasses are framework-free; Redis/SQL adapters serialise them.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Literal

Preference = Literal["casual", "listen", "story"]
EndReason = Literal["left", "partner_left", "timeout", "partner_disconnected", "reported"]

ENERGIES: tuple[int, ...] = (1, 2, 3)
PREFERENCES: tuple[str, ...] = ("casual", "listen", "story")


@dataclass(frozen=True, slots=True)
class LbtProfile:
    """What the other person sees: nickname, social battery, chat intent."""

    nickname: str
    energy: int
    preference: str

    def to_dict(self) -> dict[str, object]:
        return {"nickname": self.nickname, "energy": self.energy, "preference": self.preference}

    @classmethod
    def from_dict(cls, raw: dict[str, object]) -> LbtProfile:
        return cls(
            nickname=str(raw["nickname"]),
            energy=int(raw["energy"]),  # type: ignore[arg-type]
            preference=str(raw["preference"]),
        )


@dataclass(frozen=True, slots=True)
class LbtWaiting:
    guest_id: str
    profile: LbtProfile
    joined_at: datetime


@dataclass(frozen=True, slots=True)
class LbtConversation:
    """A 1:1 conversation between two guests.

    ``ends_at`` is server-authoritative. After it passes, both sides get a
    grace window to agree on an extension; only when *both* have asked does
    the window grow (see ``request_extend``).
    """

    id: str
    guest_a: str
    guest_b: str
    profile_a: LbtProfile
    profile_b: LbtProfile
    started_at: datetime
    ends_at: datetime
    extend_requests: frozenset[str] = field(default_factory=frozenset)
    extensions: int = 0

    def has(self, guest_id: str) -> bool:
        return guest_id in (self.guest_a, self.guest_b)

    def partner_of(self, guest_id: str) -> str:
        if guest_id == self.guest_a:
            return self.guest_b
        if guest_id == self.guest_b:
            return self.guest_a
        raise ValueError("guest is not part of this conversation")

    def profile_of(self, guest_id: str) -> LbtProfile:
        if guest_id == self.guest_a:
            return self.profile_a
        if guest_id == self.guest_b:
            return self.profile_b
        raise ValueError("guest is not part of this conversation")

    def remaining_seconds(self, now: datetime) -> int:
        return max(0, int((self.ends_at - now).total_seconds()))

    def is_past_grace(self, now: datetime, grace: timedelta) -> bool:
        return now >= self.ends_at + grace

    def request_extend(
        self, guest_id: str, now: datetime, window: timedelta
    ) -> tuple[LbtConversation, bool]:
        """Record ``guest_id``'s wish to extend.

        Returns the updated conversation and whether the window was extended
        (both sides asked). An extension starts from ``max(now, ends_at)`` so
        agreeing during the grace period still yields a full window.
        """
        if not self.has(guest_id):
            raise ValueError("guest is not part of this conversation")
        requests = self.extend_requests | {guest_id}
        if requests >= {self.guest_a, self.guest_b}:
            base = max(now, self.ends_at)
            return (
                replace(
                    self,
                    ends_at=base + window,
                    extend_requests=frozenset(),
                    extensions=self.extensions + 1,
                ),
                True,
            )
        return replace(self, extend_requests=frozenset(requests)), False

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "guest_a": self.guest_a,
            "guest_b": self.guest_b,
            "profile_a": self.profile_a.to_dict(),
            "profile_b": self.profile_b.to_dict(),
            "started_at": self.started_at.isoformat(),
            "ends_at": self.ends_at.isoformat(),
            "extend_requests": sorted(self.extend_requests),
            "extensions": self.extensions,
        }

    @classmethod
    def from_dict(cls, raw: dict[str, object]) -> LbtConversation:
        return cls(
            id=str(raw["id"]),
            guest_a=str(raw["guest_a"]),
            guest_b=str(raw["guest_b"]),
            profile_a=LbtProfile.from_dict(raw["profile_a"]),  # type: ignore[arg-type]
            profile_b=LbtProfile.from_dict(raw["profile_b"]),  # type: ignore[arg-type]
            started_at=datetime.fromisoformat(str(raw["started_at"])),
            ends_at=datetime.fromisoformat(str(raw["ends_at"])),
            extend_requests=frozenset(raw.get("extend_requests", ())),  # type: ignore[arg-type]
            extensions=int(raw.get("extensions", 0)),  # type: ignore[arg-type]
        )
