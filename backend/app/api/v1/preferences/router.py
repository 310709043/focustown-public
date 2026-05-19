from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body
from pydantic import BaseModel, RootModel

from app.core.deps import ClockDep, CurrentUserId, DbDep, IdGenDep
from app.domain.services.user_preference_service import UserPreferenceService
from app.infrastructure.db.repositories.user_preference_repo import (
    SqlUserPreferenceRepo,
)

router = APIRouter()


class PreferenceBundle(RootModel[dict[str, Any]]):
    """Whole preference bundle — flat ``{ key: value }`` map."""


class PreferenceUpdateRequest(BaseModel):
    patch: dict[str, Any]


def _service(db, ids, clock) -> UserPreferenceService:  # type: ignore[no-untyped-def]
    return UserPreferenceService(
        prefs=SqlUserPreferenceRepo(db),
        ids=ids,
        clock=clock,
    )


@router.get("", response_model=PreferenceBundle)
async def get_my_preferences(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
) -> PreferenceBundle:
    svc = _service(db, ids, clock)
    bundle = await svc.get_bundle(user_id)
    return PreferenceBundle(root=bundle)


@router.patch("", response_model=PreferenceBundle)
async def patch_my_preferences(
    user_id: CurrentUserId,
    db: DbDep,
    ids: IdGenDep,
    clock: ClockDep,
    patch: dict[str, Any] = Body(default_factory=dict),
) -> PreferenceBundle:
    svc = _service(db, ids, clock)
    bundle = await svc.patch_bundle(user_id=user_id, patch=patch)
    return PreferenceBundle(root=bundle)
