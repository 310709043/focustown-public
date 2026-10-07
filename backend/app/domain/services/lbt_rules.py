"""Pure rules for LowBatteryTown: input cleaning, pairing, opening hours.

No I/O here so every rule is unit-testable with plain values.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.domain.models.lbt import ENERGIES, PREFERENCES, LbtProfile, LbtWaiting

NICKNAME_MAX = 12
MESSAGE_MAX = 500

_CONTROL = re.compile(r"[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]")
_HOURS = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$")


class LbtInputError(ValueError):
    """Client sent a profile or message the rules reject. ``code`` is the
    machine-readable reason sent back over the socket."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def clean_text(raw: object, *, limit: int) -> str:
    """Strip control / bidi-override characters, trim, cap by code points."""
    if not isinstance(raw, str):
        return ""
    cleaned = _CONTROL.sub("", raw).replace("\r\n", "\n").replace("\r", "\n").strip()
    return "".join(list(cleaned)[:limit]).strip()


CONTACT_MASK = "•••"

_D = "0-9\uff10-\uff19"  # ASCII and full-width digits
_URL = re.compile(
    r"(?:https?://|www\.)\S+"
    r"|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\."
    r"(?:com|net|org|io|tw|me|cc|co|app|link|ly|gg|xyz|info|top|tv|to|ai|dev|page|site)"
    r"\b(?:/\S*)?",
    re.IGNORECASE,
)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_HANDLE = re.compile(r"(?<![\w@])@[A-Za-z0-9_.]{3,}")
# Separators: space, hyphen, dot, brackets, plus their full-width forms.
_SEP = "\\s\\-.()\uff0d\uff0e\uff08\uff09"
_PHONE = re.compile(rf"[+\uff0b]?[{_D}](?:[{_D}{_SEP}]{{6,}})[{_D}]")


def _mask_phone(match: re.Match[str]) -> str:
    digits = sum(ch.isdigit() for ch in match.group(0))
    return CONTACT_MASK if digits >= 8 else match.group(0)


def mask_contacts(text: str) -> str:
    """Hide links, e-mail addresses, @handles and phone numbers.

    Strangers are anonymous here on purpose; moving to another channel is
    where scams and harassment start. Runs on the server so every client
    and the report transcript see the same text. Short digit runs (times,
    years, "3 點") stay; eight or more digits read as a phone number.
    """
    # E-mail first: its domain would otherwise be taken for a bare link.
    masked = _EMAIL.sub(CONTACT_MASK, text)
    masked = _URL.sub(CONTACT_MASK, masked)
    masked = _HANDLE.sub(CONTACT_MASK, masked)
    return _PHONE.sub(_mask_phone, masked)


def parse_profile(raw: dict[str, object]) -> LbtProfile:
    nickname = clean_text(raw.get("nickname"), limit=NICKNAME_MAX).replace("\n", " ")
    if not nickname:
        raise LbtInputError("nickname_required")
    energy = raw.get("energy")
    if isinstance(energy, bool) or not isinstance(energy, int) or energy not in ENERGIES:
        raise LbtInputError("invalid_energy")
    preference = raw.get("preference")
    if preference not in PREFERENCES:
        raise LbtInputError("invalid_preference")
    return LbtProfile(nickname=nickname, energy=energy, preference=str(preference))


def compatibility(me: LbtProfile, other: LbtProfile) -> int:
    """Higher is a better pairing. 0 means "only if nobody better shows up".

    - Someone who wants to be heard pairs best with someone who wants to
      hear a story (and vice versa).
    - "Just chatting" goes with anyone.
    - Two people who both only want to be heard are the weakest match.
    - Close batteries (difference <= 1) add a point: similar reply pace.
    """
    pair = {me.preference, other.preference}
    if pair == {"listen", "story"}:
        score = 3
    elif "casual" in pair:
        score = 1
    elif pair == {"story"}:
        score = 1
    else:  # both "listen"
        score = 0
    if abs(me.energy - other.energy) <= 1:
        score += 1
    return score


def pick_partner(
    me: LbtWaiting,
    candidates: Iterable[LbtWaiting],
    *,
    now: datetime,
    relax_after: timedelta,
    blocked: set[str] | frozenset[str] = frozenset(),
) -> LbtWaiting | None:
    """Best partner for ``me`` among ``candidates`` (oldest-first order).

    A candidate needs a compatibility score of at least 1, unless either
    side has waited ``relax_after`` or longer, in which case anyone (not
    blocked) will do. Ties go to whoever has waited longest.
    """
    best: LbtWaiting | None = None
    best_score = -1
    for other in candidates:
        if other.guest_id == me.guest_id or other.guest_id in blocked:
            continue
        score = compatibility(me.profile, other.profile)
        relaxed = (
            now - me.joined_at >= relax_after or now - other.joined_at >= relax_after
        )
        if score < 1 and not relaxed:
            continue
        if score > best_score or (
            score == best_score and best is not None and other.joined_at < best.joined_at
        ):
            best, best_score = other, score
    return best


def parse_open_hours(spec: str) -> tuple[time, time] | None:
    """``"21:00-24:00"`` → (21:00, 00:00). Empty means always open.

    ``24:00`` is accepted as midnight. Raises ValueError on a bad spec so a
    misconfiguration fails at startup rather than silently closing the town.
    """
    if not spec.strip():
        return None
    m = _HOURS.match(spec)
    if not m:
        raise ValueError(f"invalid open hours: {spec!r}")
    h1, m1, h2, m2 = (int(g) for g in m.groups())
    if h1 > 24 or h2 > 24 or m1 > 59 or m2 > 59 or (h1 == 24 and m1) or (h2 == 24 and m2):
        raise ValueError(f"invalid open hours: {spec!r}")
    start = time(h1 % 24, m1)
    end = time(h2 % 24, m2)
    if start == end:
        raise ValueError(f"open hours must not be empty: {spec!r}")
    return start, end


def is_open(now: datetime, hours: tuple[time, time] | None, tz: str) -> bool:
    """Whether the street lamps are lit at ``now`` (aware datetime)."""
    if hours is None:
        return True
    local = now.astimezone(ZoneInfo(tz)).time()
    start, end = hours
    if start < end:
        return start <= local < end
    return local >= start or local < end  # window crosses midnight


# Battery-family chat avatars. Mirrors frontend/lib/lbt/avatars.ts and
# edge/src/avatars.ts: keep the order and the hash identical so every
# backend gives a conversation the same pair.
AVATAR_IDS: tuple[str, ...] = (
    "headphones",
    "blanket",
    "coffee",
    "beanie",
    "glasses",
    "scarf",
    "umbrella",
    "cathood",
    "flower",
    "plug",
)


def _fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for unit in _utf16_units(text):
        h ^= unit
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def _utf16_units(text: str) -> list[int]:
    raw = text.encode("utf-16-le")
    return [raw[i] | (raw[i + 1] << 8) for i in range(0, len(raw), 2)]


def avatar_pair(conversation_id: str) -> tuple[str, str]:
    """Two different avatars for a conversation: (guest A's, guest B's)."""
    h = _fnv1a(conversation_id)
    n = len(AVATAR_IDS)
    a = h % n
    b = (a + 1 + (h // n) % (n - 1)) % n
    return AVATAR_IDS[a], AVATAR_IDS[b]
