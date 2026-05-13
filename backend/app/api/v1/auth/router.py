from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.auth.schemas import (
    AuthResponse,
    RefreshRequest,
    SignInRequest,
    SignUpRequest,
    TokensResponse,
    UserResponse,
)
from app.core.deps import AuthProviderDep, CurrentUserId, DbDep, IdGenDep
from app.core.exceptions import AuthError, NotFoundError
from app.core.security import hash_password, verify_password
from app.domain.models import User
from app.infrastructure.db.repositories import SqlUserRepo

router = APIRouter()


def _user_dto(u: User) -> UserResponse:
    return UserResponse(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        character_key=u.character_key,
        role_label=u.role_label,
    )


@router.post("/signup", response_model=AuthResponse, status_code=201)
async def sign_up(
    payload: SignUpRequest,
    db: DbDep,
    auth: AuthProviderDep,
    ids: IdGenDep,
) -> AuthResponse:
    repo = SqlUserRepo(db)
    user = await repo.create(
        user_id=ids.new_id(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    tokens = await auth.issue_tokens(user_id=user.id)
    return AuthResponse(
        user=_user_dto(user),
        tokens=TokensResponse(
            access_token=tokens.access_token, refresh_token=tokens.refresh_token
        ),
    )


@router.post("/signin", response_model=AuthResponse)
async def sign_in(
    payload: SignInRequest,
    db: DbDep,
    auth: AuthProviderDep,
) -> AuthResponse:
    repo = SqlUserRepo(db)
    creds = await repo.get_credentials_by_email(payload.email)
    if creds is None or not verify_password(payload.password, creds.password_hash):
        raise AuthError("invalid_credentials")
    tokens = await auth.issue_tokens(user_id=creds.user.id)
    return AuthResponse(
        user=_user_dto(creds.user),
        tokens=TokensResponse(
            access_token=tokens.access_token, refresh_token=tokens.refresh_token
        ),
    )


@router.post("/refresh", response_model=TokensResponse)
async def refresh(payload: RefreshRequest, auth: AuthProviderDep) -> TokensResponse:
    pair = await auth.refresh(payload.refresh_token)
    return TokensResponse(access_token=pair.access_token, refresh_token=pair.refresh_token)


@router.get("/me", response_model=UserResponse)
async def me(user_id: CurrentUserId, db: DbDep) -> UserResponse:
    repo = SqlUserRepo(db)
    user = await repo.get_by_id(user_id)
    if user is None:
        raise NotFoundError("user_not_found")
    return _user_dto(user)
