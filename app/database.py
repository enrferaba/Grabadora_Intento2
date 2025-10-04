from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings


Base = declarative_base()

try:
    async_engine = create_async_engine(
        settings.database_url,
        echo=False,
        future=True,
    )

    async_session_factory = async_sessionmaker(
        bind=async_engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )
except ModuleNotFoundError as exc:  # pragma: no cover - depends on local Python env
    if "aiosqlite" not in str(exc):
        raise
    async_engine = None
    async_session_factory = None

sync_engine = create_engine(
    settings.sync_database_url,
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(bind=sync_engine, expire_on_commit=False, class_=Session)


@contextmanager
def get_session() -> Session:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def ensure_transcription_schema() -> None:
    inspector = inspect(sync_engine)
    if 'transcriptions' not in inspector.get_table_names():
        return
    existing = {column['name'] for column in inspector.get_columns('transcriptions')}
    if 'runtime_seconds' not in existing:
        with sync_engine.connect() as connection:
            connection.execute(text('ALTER TABLE transcriptions ADD COLUMN runtime_seconds FLOAT'))
            connection.commit()
