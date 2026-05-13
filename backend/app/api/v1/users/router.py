from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.users.schemas import ProfileUpdateRequest, UserResponse
from app.core.deps import CurrentUserId, DbDep
from app.core.exceptions import NotFoundError
from app.infrastructure.db.repositories import SqlUserRepo

router = APIRouter()


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: ProfileUpdateRequest,
    user_id: CurrentUserId,
    db: DbDep,
) -> UserResponse:
    repo = SqlUserRepo(db)
    user = await repo.update_profile(
        user_id=user_id,
        display_name=payload.display_name,
        character_key=payload.character_key,
        role_label=payload.role_label,
    )
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        character_key=user.character_key,
        role_label=user.role_label,
    )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: DbDep) -> UserResponse:
    repo = SqlUserRepo(db)
    user = await repo.get_by_id(user_id)
    if user is None:
        raise NotFoundError("user_not_found")
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        character_key=user.character_key,
        role_label=user.role_label,
    )
