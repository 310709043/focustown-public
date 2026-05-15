"""Integration test fixtures.

Strategy
--------
- Session-scoped Postgres + Redis containers (testcontainers).
- Env vars (DATABASE_URL, REDIS_URL) are set BEFORE first import of app
  code, so ``Settings()`` and ``lru_cache``-d ``get_settings`` see them.
- Alembic upgrade runs once against the container.
- Each test wraps its DB work in a nested transaction (SAVEPOINT) and
  rolls back on teardown — so test order does not matter and the DB
  stays clean without DELETE-from-everything fixtures.
- Redis is flushed between tests.

Why this matters
----------------
The plan calls for real Postgres + real Redis for integration tests.
Mocks lie about transaction semantics, partial indexes (wallet
idempotency), Redis Lua atomicity, and CTE-based daily_leaderboard
aggregation — exactly the seams these tests exist to verify.
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

# ── containers ─────────────────────────────────────────────────────────────


def _postgres_url_for_asyncpg(raw: str) -> str:
    """testcontainers returns ``postgresql+psycopg2://`` — rewrite for asyncpg."""
    return (
        raw.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
        .replace("postgresql://", "postgresql+asyncpg://")
        .replace("postgresql+psycopg://", "postgresql+asyncpg://")
    )


@pytest.fixture(scope="session")
def _postgres_container() -> Iterator[PostgresContainer]:
    container = PostgresContainer("postgres:16-alpine")
    container.start()
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture(scope="session")
def _redis_container() -> Iterator[RedisContainer]:
    container = RedisContainer("redis:7-alpine")
    container.start()
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture(scope="session")
def integration_env(
    _postgres_container: PostgresContainer,
    _redis_container: RedisContainer,
) -> Iterator[dict[str, str]]:
    """Set env BEFORE app imports and clear settings cache.

    After this fixture has run, ``get_settings()`` returns the test config.
    """
    raw_pg_url = _postgres_container.get_connection_url()
    database_url = _postgres_url_for_asyncpg(raw_pg_url)
    redis_host = _redis_container.get_container_host_ip()
    redis_port = _redis_container.get_exposed_port(6379)
    redis_url = f"redis://{redis_host}:{redis_port}/0"

    overrides = {
        "DATABASE_URL": database_url,
        "REDIS_URL": redis_url,
        "APP_SECRET_KEY": "integration-test-secret-key-32chars!",
        "APP_ENV": "test",
        "AUTH_PROVIDER": "local_jwt",
    }
    previous = {k: os.environ.get(k) for k in overrides}
    os.environ.update(overrides)

    # Reset cached settings if the app was already imported by an earlier test
    from app.core.config import get_settings

    get_settings.cache_clear()

    # Run alembic upgrade once. Run from a subprocess-style asyncio.run inside
    # the session, so the asyncio engine alembic creates does not leak into
    # the test loop.
    from alembic.config import Config

    from alembic import command

    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")

    yield overrides

    # Restore env so other test modules outside `integration/` see clean state.
    for key, value in previous.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
    get_settings.cache_clear()


# ── app + session per test ─────────────────────────────────────────────────


@pytest_asyncio.fixture
async def db_engine(integration_env):
    """Per-test engine + nested-transaction session.

    Pattern: open a single connection, start an outer transaction, then a
    nested SAVEPOINT. The session uses the connection; on teardown we
    rollback the outer transaction, undoing everything.
    """
    from sqlalchemy.ext.asyncio import (
        create_async_engine,
    )

    engine = create_async_engine(integration_env["DATABASE_URL"], future=True)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncIterator:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    async with db_engine.connect() as conn:
        outer = await conn.begin()
        factory = async_sessionmaker(
            bind=conn, expire_on_commit=False, class_=AsyncSession
        )
        async with factory() as session:
            await session.begin_nested()
            yield session
        await outer.rollback()


@pytest_asyncio.fixture
async def flushed_redis(integration_env):
    """Wipe Redis between tests so rate-limit counters and presence keys
    don't bleed across cases.

    Depended on by the ``app`` fixture so every test that talks to the
    app starts from a clean slate. Returns the live ``Redis`` client for
    tests that want to assert directly.
    """
    from redis.asyncio import Redis

    client = Redis.from_url(integration_env["REDIS_URL"], decode_responses=True)
    await client.flushdb()
    yield client
    await client.aclose()


@pytest_asyncio.fixture
async def app(integration_env, db_session, flushed_redis):
    """FastAPI app with DB + Redis overrides pointing at containers.

    Re-initialises the module-level Redis client per test: pytest-asyncio
    creates a new event loop per function, but the singleton in
    ``app.infrastructure.cache.redis_client`` would otherwise be bound to
    the previous loop and raise "Event loop is closed" on the second test.

    We do NOT run the production lifespan (which registers global
    subscribers tied to a session factory we cannot rollback). Tests that
    need event subscribers (e.g. coin award on session completion) wire
    them up explicitly so the scope is visible in the test body.
    """
    import app.infrastructure.cache.redis_client as redis_client_mod
    from app.core.deps import get_db
    from app.infrastructure.cache.redis_client import close_redis, init_redis
    from app.main import create_app

    # Bind a fresh Redis client to this test's event loop.
    redis_client_mod._client = None
    await init_redis(integration_env["REDIS_URL"])

    fastapi_app = create_app()

    async def _override_get_db():
        # Yield the same session used by db_session so tests and routes see
        # one shared transactional view.
        yield db_session

    fastapi_app.dependency_overrides[get_db] = _override_get_db

    yield fastapi_app

    fastapi_app.dependency_overrides.clear()
    await close_redis()


@pytest_asyncio.fixture
async def client(app):
    """httpx AsyncClient against the in-process ASGI app."""
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


# ── auth helper ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def authed_user(client) -> dict:
    """Sign up a user via the public API and return {id, email, tokens}.

    This is the cheapest realistic auth bootstrap: it exercises the same
    code path real clients use, so it doubles as smoke coverage.
    """
    from app.core.config import get_settings

    email = "alice@example.com"
    password = "Sup3rSecret-aaa"
    payload = {
        "email": email,
        "password": password,
        "display_name": "Alice",
        "terms_accepted": True,
        "terms_version": get_settings().terms_current_version,
        "marketing_opt_in": False,
    }
    response = await client.post("/api/v1/auth/signup", json=payload)
    response.raise_for_status()
    body = response.json()
    return {
        "id": body["user"]["id"],
        "email": email,
        "password": password,
        "access_token": body["tokens"]["access_token"],
        "refresh_token": body["tokens"]["refresh_token"],
    }


@pytest.fixture
def auth_headers(authed_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {authed_user['access_token']}"}
