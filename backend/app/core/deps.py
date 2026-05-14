from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import IClock, SystemClock
from app.core.config import Settings, get_settings
from app.core.events import EventBus
from app.core.exceptions import AuthError
from app.core.ids import IIdGenerator, UUID4Generator
from app.domain.repositories.presence import IPresenceTracker
from app.infrastructure.auth.providers.base import AuthProvider
from app.infrastructure.auth.providers.local_jwt import LocalJWTProvider
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.session import get_session_factory
from app.infrastructure.messaging.ws_manager import WSManager
from app.infrastructure.presence.redis_tracker import RedisPresenceTracker

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
