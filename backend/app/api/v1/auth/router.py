from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter

from app.api.v1.auth.schemas import (
    AuthResponse,
    ForgotPasswordRequest,
    OkResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignInRequest,
    SignUpRequest,
    TokensResponse,
    UserResponse,
)
from app.core.deps import (
    AuthProviderDep,
    ClientIpDep,
    ClockDep,
    CurrentUserId,
    DbDep,
    IdGenDep,
    NotifierDep,
    RateLimiterDep,
    SettingsDep,
)
from app.core.exceptions import AuthError, NotFoundError, RateLimitedError, ValidationError
from app.core.security import hash_password, validate_password_strength, verify_password
from app.domain.models import User
from app.domain.services.password_reset_service import PasswordResetService
from app.infrastructure.db.repositories import SqlPasswordResetTokenRepo, SqlUserRepo

router = APIRouter()


def _user_dto(u: User) -> UserResponse:
    return UserResponse(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        character_key=u.character_key,
        role_label=u.role_label,
        marketing_opt_in=u.marketing_opt_in,
    )


async def _enforce_limit(
    limiter,
    *,
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    decision = await limiter.hit(key, limit=limit, window_seconds=window_seconds)
    if not decision.allowed:
        raise RateLimitedError("rate_limited")


def _reset_service(
    db,
    notifier,
    clock,
    ids,
    settings,
) -> PasswordResetService:
    return PasswordResetService(
        users=SqlUserRepo(db),
        tokens=SqlPasswordResetTokenRepo(db),
        notifier=notifier,
        clock=clock,
        ids=ids,
        token_ttl=timedelta(hours=settings.reset_token_ttl_hours),
        reset_url_base=settings.reset_url_base,
    )


@router.post("/signup", response_model=AuthResponse, status_code=201)
async def sign_up(
    payload: SignUpRequest,
    db: DbDep,
    auth: AuthProviderDep,
    ids: IdGenDep,
    clock: ClockDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> AuthResponse:
    await _enforce_limit(
        limiter,
        key=f"signup:ip:{client_ip or 'unknown'}",
        limit=10,
        window_seconds=3600,
    )

    if not payload.terms_accepted:
        raise ValidationError("terms_must_be_accepted")
    if payload.terms_version != settings.terms_current_version:
        raise ValidationError("terms_version_mismatch")

    validate_password_strength(payload.password)

    now = clock.now()
    repo = SqlUserRepo(db)
    user = await repo.create(
        user_id=ids.new_id(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        terms_accepted_at=now,
        terms_version=payload.terms_version,
        marketing_opt_in=payload.marketing_opt_in,
        marketing_opt_in_at=now if payload.marketing_opt_in else None,
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
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> AuthResponse:
    await _enforce_limit(
        limiter,
        key=f"signin:email:{payload.email.lower()}",
        limit=5,
        window_seconds=60,
    )
    await _enforce_limit(
        limiter,
        key=f"signin:ip:{client_ip or 'unknown'}",
        limit=30,
        window_seconds=3600,
    )

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


@router.post("/forgot-password", response_model=OkResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: DbDep,
    notifier: NotifierDep,
    clock: ClockDep,
    ids: IdGenDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> OkResponse:
    await _enforce_limit(
        limiter,
        key=f"forgot:ip:{client_ip or 'unknown'}",
        limit=5,
        window_seconds=3600,
    )
    await _enforce_limit(
        limiter,
        key=f"forgot:email:{payload.email.lower()}",
        limit=3,
        window_seconds=3600,
    )

    service = _reset_service(db, notifier, clock, ids, settings)
    await service.request_reset(email=payload.email, requested_ip=client_ip)
    return OkResponse()


@router.post("/reset-password", response_model=OkResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    db: DbDep,
    notifier: NotifierDep,
    clock: ClockDep,
    ids: IdGenDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> OkResponse:
    await _enforce_limit(
        limiter,
        key=f"reset:ip:{client_ip or 'unknown'}",
        limit=10,
        window_seconds=3600,
    )

    service = _reset_service(db, notifier, clock, ids, settings)
    await service.reset_password(
        raw_token=payload.token,
        new_password=payload.new_password,
    )
    return OkResponse()
