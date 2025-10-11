from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy import pool

from backend_sync.config import get_settings
from backend_sync.database import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _normalized_database_url() -> str:
    url = config.get_main_option("sqlalchemy.url") or os.getenv("DATABASE_URL")
    if not url:
        url = get_settings().database_url
    if url.startswith("sqlite+"):
        url = url.replace("aiosqlite", "pysqlite")
    return url


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {
            "future": True,
            "poolclass": pool.NullPool,
            "connect_args": {"check_same_thread": False},
        }
    return {"future": True, "pool_pre_ping": True}


target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""

    url = _normalized_database_url()
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    url = _normalized_database_url()
    connectable = create_engine(url, **_engine_kwargs(url))

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
