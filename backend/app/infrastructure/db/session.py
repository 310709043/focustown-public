"""Async SQLAlchemy engine + session factory.

Engine pooling is read from ``Settings`` (``db_pool_size`` / ``db_max_overflow``
/ ``db_pool_recycle`` / ``db_pool_timeout``) so PG ``max_connections`` cannot
be exhausted silently — saturation surfaces as ``OperationalError`` → 503
``Retry-After`` rather than unbounded blocking. ``isolation_level`` is pinned
to ``READ COMMITTED`` explicitly even though it is PG's default, so the
contract is visible.

``autoflush=False`` on the sessionmaker is deliberate: previously, surprise
flushes inside ``select()`` calls inside the wallet refactor produced
phantom ``IntegrityError``\\ s because in-progress mutations were pushed to
the DB before the read query ran. Repositories now opt into flushing
explicitly (``await self._s.flush()``) when they need an ID or constraint
check before commit.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.infrastructure.db.observability import install_engine_event_listeners

_engines: dict[str, AsyncEngine] = {}
_factories: dict[str, async_sessionmaker[AsyncSession]] = {}


def get_engine(database_url: str) -> AsyncEngine:
    engine = _engines.get(database_url)
    if engine is None:
        settings = get_settings()
        engine = create_async_engine(
            database_url,
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_recycle=settings.db_pool_recycle,
            pool_timeout=settings.db_pool_timeout,
            isolation_level="READ COMMITTED",
            future=True,
        )
        install_engine_event_listeners(engine)
        _engines[database_url] = engine
    return engine


def get_session_factory(database_url: str) -> async_sessionmaker[AsyncSession]:
    factory = _factories.get(database_url)
    if factory is None:
        factory = async_sessionmaker(
            bind=get_engine(database_url),
            expire_on_commit=False,
            autoflush=False,
            class_=AsyncSession,
        )
        _factories[database_url] = factory
    return factory


async def dispose_engine() -> None:
    for engine in list(_engines.values()):
        await engine.dispose()
    _engines.clear()
    _factories.clear()
