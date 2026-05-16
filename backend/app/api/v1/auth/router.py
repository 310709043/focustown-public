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
    VehicleViewBrief,
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
from app.core.exceptions import RateLimitedError
from app.domain.models import User
from app.domain.services.auth_service import AuthOutcome, AuthService
from app.domain.services.equipment_service import VehicleRenderMeta
from app.domain.services.password_reset_service import PasswordResetService
from app.infrastructure.db.repositories import (
    SqlPasswordResetTokenRepo,
    SqlShopRepo,
    SqlUserRepo,
)

router = APIRouter()


def _user_dto(
    u: User, equipped_vehicle: VehicleRenderMeta | None = None
) -> UserResponse:
    return UserResponse(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        character_key=u.character_key,
        role_label=u.role_label,
        marketing_opt_in=u.marketing_opt_in,
        equipped_vehicle_item_id=u.equipped_vehicle_item_id,
        equipped_vehicle=(
            VehicleViewBrief(
                icon=equipped_vehicle.icon,
                body_color=equipped_vehicle.body_color,
                roof_color=equipped_vehicle.roof_color,
            )
            if equipped_vehicle is not None
            else None
        ),
    )


def _to_auth_response(outcome: AuthOutcome) -> AuthResponse:
    return AuthResponse(
        user=_user_dto(outcome.user),
        tokens=TokensResponse(
            access_token=outcome.tokens.access_token,
            refresh_token=outcome.tokens.refresh_token,
        ),
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


def _auth_service(db, auth, ids, clock) -> AuthService:
    return AuthService(
        users=SqlUserRepo(db),
        auth_provider=auth,
        ids=ids,
        clock=clock,
    )


def _reset_service(
    db,
    notifier,
    auth,
    clock,
    ids,
    settings,
) -> PasswordResetService:
    return PasswordResetService(
        users=SqlUserRepo(db),
        tokens=SqlPasswordResetTokenRepo(db),
        notifier=notifier,
        auth=auth,
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
        limit=settings.auth_rl_signup_per_ip_per_hour,
        window_seconds=3600,
    )
    outcome = await _auth_service(db, auth, ids, clock).sign_up(
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
        terms_accepted=payload.terms_accepted,
        terms_version=payload.terms_version,
        marketing_opt_in=payload.marketing_opt_in,
        terms_current_version=settings.terms_current_version,
    )
    return _to_auth_response(outcome)


@router.post("/signin", response_model=AuthResponse)
async def sign_in(
    payload: SignInRequest,
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
        key=f"signin:email:{payload.email.lower()}",
        limit=settings.auth_rl_signin_per_email_per_min,
        window_seconds=60,
    )
    await _enforce_limit(
        limiter,
        key=f"signin:ip:{client_ip or 'unknown'}",
        limit=settings.auth_rl_signin_per_ip_per_hour,
        window_seconds=3600,
    )
    outcome = await _auth_service(db, auth, ids, clock).sign_in(
        email=payload.email,
        password=payload.password,
    )
    return _to_auth_response(outcome)


@router.post("/refresh", response_model=TokensResponse)
async def refresh(payload: RefreshRequest, auth: AuthProviderDep) -> TokensResponse:
    pair = await auth.refresh(payload.refresh_token)
    return TokensResponse(access_token=pair.access_token, refresh_token=pair.refresh_token)


@router.get("/me", response_model=UserResponse)
async def me(
    user_id: CurrentUserId,
    db: DbDep,
    auth: AuthProviderDep,
    ids: IdGenDep,
    clock: ClockDep,
) -> UserResponse:
    user, vehicle = await _auth_service(db, auth, ids, clock).get_me_with_vehicle(
        user_id, shop=SqlShopRepo(db)
    )
    return _user_dto(user, vehicle)


@router.post("/forgot-password", response_model=OkResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: DbDep,
    notifier: NotifierDep,
    auth: AuthProviderDep,
    clock: ClockDep,
    ids: IdGenDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> OkResponse:
    await _enforce_limit(
        limiter,
        key=f"forgot:ip:{client_ip or 'unknown'}",
        limit=settings.auth_rl_forgot_per_ip_per_hour,
        window_seconds=3600,
    )
    await _enforce_limit(
        limiter,
        key=f"forgot:email:{payload.email.lower()}",
        limit=settings.auth_rl_forgot_per_email_per_hour,
        window_seconds=3600,
    )

    service = _reset_service(db, notifier, auth, clock, ids, settings)
    await service.request_reset(
        email=payload.email,
        requested_ip=client_ip,
        locale=payload.locale,
    )
    return OkResponse()


@router.post("/reset-password", response_model=OkResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    db: DbDep,
    notifier: NotifierDep,
    auth: AuthProviderDep,
    clock: ClockDep,
    ids: IdGenDep,
    settings: SettingsDep,
    limiter: RateLimiterDep,
    client_ip: ClientIpDep,
) -> OkResponse:
    await _enforce_limit(
        limiter,
        key=f"reset:ip:{client_ip or 'unknown'}",
        limit=settings.auth_rl_reset_per_ip_per_hour,
        window_seconds=3600,
    )

    service = _reset_service(db, notifier, auth, clock, ids, settings)
    await service.reset_password(
        raw_token=payload.token,
        new_password=payload.new_password,
    )
    return OkResponse()
