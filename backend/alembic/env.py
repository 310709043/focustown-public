from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.infrastructure.db.base import Base
from app.infrastructure.db.models import *  # noqa: F401,F403 (register tables)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()


_MANAGED_DB_HOST_SUFFIXES = (
    ".rds.amazonaws.com",   # AWS RDS / Aurora
    ".neon.tech",           # Neon
    ".supabase.co",         # Supabase
)


def _database_url_for_alembic() -> str:
    """Apply SSL posture for known managed Postgres hosts.

    The driver is ``postgresql+asyncpg``; asyncpg honours the ``ssl=``
    parameter (NOT libpq's ``sslmode=``). We append ``ssl=require`` only
    when (a) no SSL preference is already encoded in the URL, AND (b) the
    URL targets a known managed-Postgres host. This avoids forcing SSL on
    in-cluster Postgres (e.g. the single-VM Lightsail deploy where the
    backend reaches ``postgres:5432`` over the docker bridge network).
    Operators with a custom managed host can still opt in by setting
    ``ssl=require`` in DATABASE_URL directly.
    """
    url = settings.database_url
    if "ssl=" in url or "sslmode=" in url:
        return url
    if any(suffix in url for suffix in _MANAGED_DB_HOST_SUFFIXES):
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}ssl=require"
    return url


config.set_main_option("sqlalchemy.url", _database_url_for_alembic())

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
