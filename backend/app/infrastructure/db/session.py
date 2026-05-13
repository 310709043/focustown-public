from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_engines: dict[str, AsyncEngine] = {}
_factories: dict[str, async_sessionmaker[AsyncSession]] = {}


def get_engine(database_url: str) -> AsyncEngine:
    engine = _engines.get(database_url)
    if engine is None:
        engine = create_async_engine(database_url, pool_pre_ping=True, future=True)
        _engines[database_url] = engine
    return engine


def get_session_factory(database_url: str) -> async_sessionmaker[AsyncSession]:
    factory = _factories.get(database_url)
    if factory is None:
        factory = async_sessionmaker(
            bind=get_engine(database_url),
            expire_on_commit=False,
            class_=AsyncSession,
        )
        _factories[database_url] = factory
    return factory


async def dispose_engine() -> None:
    for engine in list(_engines.values()):
        await engine.dispose()
    _engines.clear()
    _factories.clear()
