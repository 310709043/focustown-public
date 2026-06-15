from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta, timezone

from app.core.events import EventBus
from app.core.exceptions import IdempotencyViolationError
from app.core.logging import get_logger
from app.domain.events import SessionCompleted
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.services.wallet_service import WalletService

log = get_logger(__name__)


# 100 cT (= 1 T) per 30 minutes of focused work. Phase 2 deals exclusively in
# T; future earning sources (login bonus, quests) will introduce additional
# reasons but reuse the same WalletService.credit pipeline.
EARN_RATE_MINOR_PER_30MIN = 100
EARN_DENOMINATOR_SECONDS = 1800

# Late-night bonus: extra cT for sessions ending 00:00-04:00 UTC+8.
LATE_NIGHT_BONUS_MINOR = 10
_UTC_PLUS_8 = timezone(timedelta(hours=8))

# Streak bonus table: (min_days, bonus_cT). Checked highest-first.
_STREAK_BONUS_TABLE: list[tuple[int, int]] = [
    (30, 30),
    (14, 20),
    (7, 10),
    (3, 5),
]


def compute_award_minor(duration_seconds: int) -> int:
    """duration_seconds * 100 // 1800 -> 0.5 T for 15 min, 1 T for 30 min."""
    if duration_seconds <= 0:
        return 0
    return duration_seconds * EARN_RATE_MINOR_PER_30MIN // EARN_DENOMINATOR_SECONDS


def compute_night_bonus(ended_at_utc: datetime) -> int:
    """Return LATE_NIGHT_BONUS_MINOR if ended_at falls in 00:00-04:00 UTC+8."""
    local = ended_at_utc.astimezone(_UTC_PLUS_8)
    if 0 <= local.hour < 4:
        return LATE_NIGHT_BONUS_MINOR
    return 0


def compute_streak_bonus(streak_days: int) -> int:
    """Return bonus cT based on consecutive focus day count."""
    for min_days, bonus in _STREAK_BONUS_TABLE:
        if streak_days >= min_days:
            return bonus
    return 0


def compute_streak_from_days(day_dates: list[datetime], today: date) -> int:
    """Walk back from today counting consecutive days with focus sessions.

    Accepts the raw datetime list from ``completed_focus_days_since`` and
    deduplicates to UTC calendar days. Allows the streak to start from
    yesterday (grace window so a user at 00:05 UTC still sees their streak).
    """
    if not day_dates:
        return 0
    day_set = {d.replace(hour=0, minute=0, second=0, microsecond=0).date() for d in day_dates}
    streak = 0
    cursor = today
    if today not in day_set and (today - timedelta(days=1)) in day_set:
        cursor = today - timedelta(days=1)
    while cursor in day_set and streak < 365:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return streak


# A factory the lifespan-registered subscriber uses to spin up a per-event
# WalletService bound to its own short-lived DB session.
WalletServiceFactory = Callable[[], "_WalletServiceAcquired"]


class _WalletServiceAcquired:
    """Bag of (wallet_service, focus_sessions, commit, rollback, close)."""

    def __init__(
        self,
        *,
        wallet_service: WalletService,
        focus_sessions: IFocusSessionRepo | None = None,
        commit: Callable[[], Awaitable[None]],
        rollback: Callable[[], Awaitable[None]],
        close: Callable[[], Awaitable[None]],
    ) -> None:
        self.wallet_service = wallet_service
        self.focus_sessions = focus_sessions
        self.commit = commit
        self.rollback = rollback
        self.close = close


class CoinAwardService:
    """Credits T coins on SessionCompleted.

    Registered ONCE at app startup (see ``main.py`` lifespan). Each event
    opens its own DB session via the injected factory so we don't hold the
    request's session beyond the request's lifetime.
    """

    def __init__(self, factory: WalletServiceFactory) -> None:
        self._factory = factory

    def register(self, bus: EventBus) -> None:
        bus.subscribe(SessionCompleted, self._on_session_completed)

    async def _on_session_completed(self, event: SessionCompleted) -> None:
        base = compute_award_minor(event.duration_seconds)
        night = compute_night_bonus(event.ended_at)

        acquired = self._factory()

        # Compute streak bonus if repo is available.
        streak_days = 0
        streak = 0
        if acquired.focus_sessions is not None:
            try:
                horizon = datetime.now(UTC) - timedelta(days=365)
                days = await acquired.focus_sessions.completed_focus_days_since(
                    user_id=event.user_id, since=horizon,
                )
                streak_days = compute_streak_from_days(days, datetime.now(UTC).date())
                streak = compute_streak_bonus(streak_days)
            except Exception:
                log.warning("streak_computation_failed", user_id=event.user_id, exc_info=True)

        total = base + night + streak
        if total == 0:
            await acquired.close()
            return

        metadata = {
            "base": base,
            "night": night,
            "streak": streak,
            "streak_days": streak_days,
        }

        try:
            try:
                await acquired.wallet_service.credit(
                    user_id=event.user_id,
                    currency_code="T",
                    amount_minor=total,
                    reason="session_complete",
                    ref_type="focus_session",
                    ref_id=event.session_id,
                    metadata=metadata,
                )
                await acquired.commit()
            except IdempotencyViolationError:
                # Same session already awarded (e.g. retry); silently skip.
                await acquired.rollback()
        finally:
            await acquired.close()
