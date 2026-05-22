"""Unit tests for ``UserPreferenceService``.

Covers: defaults returned for new user, per-key shape validation,
overlay of stored values on top of defaults, unknown-key rejection.
"""

from __future__ import annotations

import itertools
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.clock import IClock
from app.core.exceptions import ValidationError
from app.core.ids import IIdGenerator
from app.domain.repositories.user_preference_repo import IUserPreferenceRepo
from app.domain.services.user_preference_service import (
    DEFAULTS,
    KEY_FOCUS_DAILY_GOAL,
    KEY_LANGUAGE_PREFERRED,
    KEY_NOTIFICATIONS_DAILY,
    KEY_SOUND_MIX,
    UserPreferenceService,
)


class CounterIds(IIdGenerator):
    def __init__(self) -> None:
        self._n = itertools.count(1)

    def new_id(self) -> str:
        return f"id-{next(self._n)}"


class FrozenClock(IClock):
    def now(self) -> datetime:  # type: ignore[override]
        return datetime(2026, 5, 19, tzinfo=UTC)


class FakeRepo(IUserPreferenceRepo):
    def __init__(self) -> None:
        self.store: dict[tuple[str, str], Any] = {}

    async def list_for_user(self, user_id: str) -> dict[str, Any]:
        return {key: v for (uid, key), v in self.store.items() if uid == user_id}

    async def upsert_many(
        self,
        *,
        user_id: str,
        entries: dict[str, Any],
        id_factory: Callable[[], str],
    ) -> None:
        for key, value in entries.items():
            self.store[(user_id, key)] = value


def _service() -> tuple[UserPreferenceService, FakeRepo]:
    repo = FakeRepo()
    svc = UserPreferenceService(prefs=repo, ids=CounterIds(), clock=FrozenClock())
    return svc, repo


@pytest.mark.asyncio
async def test_get_bundle_returns_defaults_for_new_user() -> None:
    svc, _ = _service()
    bundle = await svc.get_bundle("user-1")
    assert bundle == DEFAULTS


@pytest.mark.asyncio
async def test_patch_persists_and_overlays_on_defaults() -> None:
    svc, repo = _service()
    bundle = await svc.patch_bundle(
        user_id="user-1",
        patch={
            KEY_SOUND_MIX: {"lofi": 80, "rain": 20, "cafe": 0, "fire": 5},
            KEY_FOCUS_DAILY_GOAL: 6,
        },
    )
    assert bundle[KEY_SOUND_MIX] == {"lofi": 80, "rain": 20, "cafe": 0, "fire": 5}
    assert bundle[KEY_FOCUS_DAILY_GOAL] == 6
    assert bundle[KEY_LANGUAGE_PREFERRED] == DEFAULTS[KEY_LANGUAGE_PREFERRED]
    assert ("user-1", KEY_SOUND_MIX) in repo.store


@pytest.mark.asyncio
async def test_patch_unknown_key_is_rejected() -> None:
    svc, _ = _service()
    with pytest.raises(ValidationError):
        await svc.patch_bundle(
            user_id="user-1", patch={"haxx0r.flag": True}
        )


@pytest.mark.asyncio
async def test_patch_sound_mix_invalid_range_rejected() -> None:
    svc, _ = _service()
    with pytest.raises(ValidationError):
        await svc.patch_bundle(
            user_id="user-1",
            patch={KEY_SOUND_MIX: {"lofi": 200, "rain": 0, "cafe": 0, "fire": 0}},
        )


@pytest.mark.asyncio
async def test_patch_daily_goal_rejects_non_quota_values() -> None:
    svc, _ = _service()
    with pytest.raises(ValidationError):
        await svc.patch_bundle(
            user_id="user-1", patch={KEY_FOCUS_DAILY_GOAL: 3}
        )


@pytest.mark.asyncio
async def test_patch_notifications_daily_normalises_time() -> None:
    svc, repo = _service()
    bundle = await svc.patch_bundle(
        user_id="user-1",
        patch={
            KEY_NOTIFICATIONS_DAILY: {"enabled": True, "time": "07:05"}
        },
    )
    assert bundle[KEY_NOTIFICATIONS_DAILY] == {
        "enabled": True,
        "time": "07:05",
    }


@pytest.mark.asyncio
async def test_patch_language_must_be_supported_locale() -> None:
    svc, _ = _service()
    with pytest.raises(ValidationError):
        await svc.patch_bundle(
            user_id="user-1", patch={KEY_LANGUAGE_PREFERRED: "fr"}
        )
