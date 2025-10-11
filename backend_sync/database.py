"""Database setup using SQLAlchemy 2.0."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings

settings = get_settings()
Base = declarative_base()


def _normalized_url(url: str) -> str:
    if url.startswith("sqlite+"):
        return url.replace("aiosqlite", "pysqlite")
    return url


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {
            "future": True,
            "echo": False,
            "connect_args": {"check_same_thread": False},
            "poolclass": NullPool,
        }
    return {"future": True, "echo": False, "pool_pre_ping": True}


def create_engine_from_settings(database_url: str | None = None) -> Engine:
    url = _normalized_url(database_url or settings.database_url)
    return create_engine(url, **_engine_kwargs(url))


engine = create_engine_from_settings()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
