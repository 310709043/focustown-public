"""User preferences — single JSONB key/value bag with per-key validation.

SOLID notes:
  * SRP: the service only owns key-shape validation + persistence; the
    "what's a sensible default" question is answered by the small
    ``DEFAULTS`` table here so the FE can render predictable values
    even before the user has saved anything.
  * DIP: depends on ``IUserPreferenceRepo`` (Protocol), ``IIdGenerator``,
    ``IClock``. No SQL imports.
  * OCP: adding a new preference key is a one-line addition to
    ``ALLOWED_KEYS`` + a single validator entry; existing keys are
    closed for modification.
"""

from __future__ import annotations

from typing import Any, Callable

from app.core.clock import IClock
from app.core.exceptions import ValidationError
from app.core.ids import IIdGenerator
from app.domain.repositories.user_preference_repo import IUserPreferenceRepo

KEY_SOUND_MIX = "sound.mix"
KEY_NOTIFICATIONS_DAILY = "notifications.daily"
KEY_LANGUAGE_PREFERRED = "language.preferred"
KEY_FOCUS_DAILY_GOAL = "focus.daily_goal"
KEY_FOCUS_DURATION_MINUTES = "focus.duration_minutes"
KEY_UI_SCENE_ROTATION = "ui.scene_rotation"


def _v_sound_mix(value: Any) -> Any:
    if not isinstance(value, dict):
        raise ValidationError("preference_invalid_sound_mix")
    cleaned: dict[str, int] = {}
    for ch in ("lofi", "rain", "cafe", "fire"):
        v = value.get(ch, 0)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValidationError("preference_invalid_sound_mix")
        n = int(v)
        if n < 0 or n > 100:
            raise ValidationError("preference_invalid_sound_mix")
        cleaned[ch] = n
    return cleaned


def _v_notifications_daily(value: Any) -> Any:
    if not isinstance(value, dict):
        raise ValidationError("preference_invalid_notifications_daily")
    enabled = value.get("enabled", False)
    time_str = value.get("time", "09:00")
    if not isinstance(enabled, bool):
        raise ValidationError("preference_invalid_notifications_daily")
    if not isinstance(time_str, str) or len(time_str) != 5 or time_str[2] != ":":
        raise ValidationError("preference_invalid_notifications_daily")
    try:
        hh, mm = int(time_str[:2]), int(time_str[3:])
    except ValueError as exc:
        raise ValidationError("preference_invalid_notifications_daily") from exc
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        raise ValidationError("preference_invalid_notifications_daily")
    return {"enabled": enabled, "time": f"{hh:02d}:{mm:02d}"}


def _v_language_preferred(value: Any) -> Any:
    if value not in ("zh-TW", "en"):
        raise ValidationError("preference_invalid_language")
    return value


def _v_focus_daily_goal(value: Any) -> Any:
    if value not in (2, 4, 6, 8):
        raise ValidationError("preference_invalid_focus_daily_goal")
    return value


def _v_focus_duration_minutes(value: Any) -> Any:
    if value not in (15, 25, 50, 90):
        raise ValidationError("preference_invalid_focus_duration")
    return value


def _v_ui_scene_rotation(value: Any) -> Any:
    if not isinstance(value, bool):
        raise ValidationError("preference_invalid_scene_rotation")
    return value


VALIDATORS: dict[str, Callable[[Any], Any]] = {
    KEY_SOUND_MIX: _v_sound_mix,
    KEY_NOTIFICATIONS_DAILY: _v_notifications_daily,
    KEY_LANGUAGE_PREFERRED: _v_language_preferred,
    KEY_FOCUS_DAILY_GOAL: _v_focus_daily_goal,
    KEY_FOCUS_DURATION_MINUTES: _v_focus_duration_minutes,
    KEY_UI_SCENE_ROTATION: _v_ui_scene_rotation,
}


DEFAULTS: dict[str, Any] = {
    KEY_SOUND_MIX: {"lofi": 60, "rain": 0, "cafe": 0, "fire": 0},
    KEY_NOTIFICATIONS_DAILY: {"enabled": False, "time": "09:00"},
    KEY_LANGUAGE_PREFERRED: "zh-TW",
    KEY_FOCUS_DAILY_GOAL: 4,
    KEY_FOCUS_DURATION_MINUTES: 25,
    KEY_UI_SCENE_ROTATION: True,
}


class UserPreferenceService:
    def __init__(
        self,
        *,
        prefs: IUserPreferenceRepo,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._prefs = prefs
        self._ids = ids
        self._clock = clock

    async def get_bundle(self, user_id: str) -> dict[str, Any]:
        stored = await self._prefs.list_for_user(user_id)
        out = dict(DEFAULTS)
        out.update({k: v for k, v in stored.items() if k in VALIDATORS})
        return out

    async def patch_bundle(
        self, *, user_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        if not patch:
            return await self.get_bundle(user_id)
        cleaned: dict[str, Any] = {}
        for key, raw in patch.items():
            validator = VALIDATORS.get(key)
            if validator is None:
                raise ValidationError("preference_unknown_key")
            cleaned[key] = validator(raw)
        await self._prefs.upsert_many(
            user_id=user_id,
            entries=cleaned,
            id_factory=self._ids.new_id,
        )
        return await self.get_bundle(user_id)
