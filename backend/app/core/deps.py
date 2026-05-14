from __future__ import annotations

import ipaddress as _ipaddress
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import IClock, SystemClock
from app.core.config import Settings, get_settings
from app.core.events import EventBus
from app.core.exceptions import AuthError
from app.core.ids import IIdGenerator, UUID4Generator
from app.domain.notifications import INotificationService
from app.domain.rate_limit import IRateLimiter
from app.domain.repositories.presence import IPresenceTracker
from app.infrastructure.auth.providers.base import AuthProvider
from app.infrastructure.auth.providers.local_jwt import LocalJWTProvider
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.session import get_session_factory
from app.infrastructure.messaging.ws_manager import WSManager
from app.infrastructure.notifications.log_notifier import LogNotifier
from app.infrastructure.presence.redis_tracker import RedisPresenceTracker
from app.infrastructure.rate_limit.redis_limiter import RedisRateLimiter

SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_db(settings: SettingsDep) -> AsyncIterator[AsyncSession]:
    factory = get_session_factory(settings.database_url)
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DbDep = Annotated[AsyncSession, Depends(get_db)]


def get_clock() -> IClock:
    return SystemClock()


ClockDep = Annotated[IClock, Depends(get_clock)]


def get_id_gen() -> IIdGenerator:
    return UUID4Generator()


IdGenDep = Annotated[IIdGenerator, Depends(get_id_gen)]


_event_bus = EventBus()


def get_event_bus() -> EventBus:
    return _event_bus


EventBusDep = Annotated[EventBus, Depends(get_event_bus)]


def get_auth_provider(settings: SettingsDep) -> AuthProvider:
    if settings.auth_provider == "local_jwt":
        return LocalJWTProvider(settings)
    if settings.auth_provider == "cognito":
        from app.infrastructure.auth.providers.cognito import CognitoProvider

        return CognitoProvider(settings)
    raise RuntimeError(f"unsupported auth_provider: {settings.auth_provider}")


AuthProviderDep = Annotated[AuthProvider, Depends(get_auth_provider)]


_ws_manager = WSManager()


def get_ws_manager() -> WSManager:
    return _ws_manager


WSManagerDep = Annotated[WSManager, Depends(get_ws_manager)]


def get_presence_tracker(clock: ClockDep) -> IPresenceTracker:
    return RedisPresenceTracker(get_redis(), clock)


PresenceTrackerDep = Annotated[IPresenceTracker, Depends(get_presence_tracker)]


async def get_current_user_id(
    auth: AuthProviderDep,
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("missing_bearer_token")
    token = authorization.split(" ", 1)[1].strip()
    principal = await auth.verify_access_token(token)
    return principal.user_id


CurrentUserId = Annotated[str, Depends(get_current_user_id)]


def get_notifier() -> INotificationService:
    """Swap point: LogNotifier (dev) → SESNotifier / SNSNotifier (prod)."""
    return LogNotifier()


NotifierDep = Annotated[INotificationService, Depends(get_notifier)]


def get_rate_limiter() -> IRateLimiter:
    return RedisRateLimiter(get_redis())


RateLimiterDep = Annotated[IRateLimiter, Depends(get_rate_limiter)]


def _parse_ip(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return str(_ipaddress.ip_address(raw))
    except ValueError:
        return None


def get_client_ip(request: Request, settings: SettingsDep) -> str | None:
    """Client IP for rate limiting and audit columns.

    Returns the direct socket peer by default. Honours X-Forwarded-For ONLY
    when the immediate peer is a configured trusted proxy (see
    Settings.app_trusted_proxies). Returns None if no valid IP can be
    determined — callers should treat None as "unknown" and apply per-key
    fallbacks rather than skipping limits.
    """
    peer = request.client.host if request.client else None
    peer_validated = _parse_ip(peer)

    networks = settings.trusted_proxy_networks
    if peer_validated and networks:
        try:
            peer_addr = _ipaddress.ip_address(peer_validated)
            if any(peer_addr in net for net in networks):
                forwarded = request.headers.get("x-forwarded-for")
                if forwarded:
                    candidate = forwarded.split(",", 1)[0].strip()
                    parsed = _parse_ip(candidate)
                    if parsed:
                        return parsed
        except ValueError:
            pass

    return peer_validated


ClientIpDep = Annotated[str | None, Depends(get_client_ip)]
