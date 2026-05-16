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
from app.domain.notifications import IEmailSender
from app.domain.rate_limit import IRateLimiter
from app.domain.repositories.presence import IPresenceTracker
from app.domain.repositories.realtime import IRealtimePublisher
from app.infrastructure.auth.providers.base import AuthProvider
from app.infrastructure.auth.providers.local_jwt import LocalJWTProvider
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.session import get_session_factory
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher
from app.infrastructure.messaging.ws_manager import WSManager
from app.infrastructure.notifications.factory import make_email_sender
from app.infrastructure.presence.redis_tracker import RedisPresenceTracker
from app.infrastructure.rate_limit.redis_limiter import RedisRateLimiter
from app.infrastructure.secrets.base import ISecretsProvider
from app.infrastructure.secrets.factory import make_secrets_provider
from app.infrastructure.storage.base import IFileStorage
from app.infrastructure.storage.factory import make_storage

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


def get_auth_provider(settings: SettingsDep, db: DbDep) -> AuthProvider:
    if settings.auth_provider == "local_jwt":
        # Local mode doesn't read users at the provider level — the db
        # session is harmless and FastAPI's Depends graph dedupes against
        # any router that also asks for DbDep, so no extra cost.
        del db
        return LocalJWTProvider(settings)
    if settings.auth_provider == "cognito":
        # CognitoProvider needs an IUserReader to map ``sub`` claims back
        # to our internal users.id and to fetch the email for
        # admin_set_user_password. We construct a thin SqlUserRepo over the
        # request's session so the provider stays decoupled from SQLAlchemy.
        from app.infrastructure.auth.providers.cognito import CognitoProvider
        from app.infrastructure.db.repositories.user_repo import SqlUserRepo

        return CognitoProvider(settings, users=SqlUserRepo(db))
    raise RuntimeError(f"unsupported auth_provider: {settings.auth_provider}")


AuthProviderDep = Annotated[AuthProvider, Depends(get_auth_provider)]


_ws_manager = WSManager()


def get_ws_manager() -> WSManager:
    return _ws_manager


WSManagerDep = Annotated[WSManager, Depends(get_ws_manager)]


def get_presence_tracker(clock: ClockDep) -> IPresenceTracker:
    return RedisPresenceTracker(get_redis(), clock)


PresenceTrackerDep = Annotated[IPresenceTracker, Depends(get_presence_tracker)]


def get_realtime_publisher() -> IRealtimePublisher:
    """Single wire point for realtime publishing.

    Routers / services depend on the ``IRealtimePublisher`` Protocol so
    swapping the backend (Redis → Kafka / NATS / ...) only touches this
    factory.
    """
    return RedisPubSubPublisher(get_redis())


RealtimePublisherDep = Annotated[IRealtimePublisher, Depends(get_realtime_publisher)]


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


def get_notifier(settings: SettingsDep) -> IEmailSender:
    """Email-sender dispatch: LogNotifier (dev) → SESNotifier (prod).

    Returns the narrower ``IEmailSender`` interface — the only side wired
    this round. Push delivery (``IPushSender``) lands in a follow-up and
    will get its own factory + Dep alias.
    """
    return make_email_sender(settings)


NotifierDep = Annotated[IEmailSender, Depends(get_notifier)]


def get_secrets_provider(settings: SettingsDep) -> ISecretsProvider:
    """Dispatch point: EnvSecretsProvider (dev/test) → AWSSecretsManagerProvider.

    Most secrets enter the process via ECS task-definition env injection at
    boot; this Dep is for the long tail (feature flags, third-party keys
    looked up per request).
    """
    return make_secrets_provider(settings)


SecretsProviderDep = Annotated[ISecretsProvider, Depends(get_secrets_provider)]


def get_rate_limiter() -> IRateLimiter:
    return RedisRateLimiter(get_redis())


RateLimiterDep = Annotated[IRateLimiter, Depends(get_rate_limiter)]


def get_storage(settings: SettingsDep) -> IFileStorage:
    """Dispatch to the configured storage backend. Delegates to the
    factory so seed scripts and workers can share the same construction
    logic without going through FastAPI's Depends machinery."""
    return make_storage(settings)


StorageDep = Annotated[IFileStorage, Depends(get_storage)]


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
