"""Database setup using SQLAlchemy 2.0."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url.replace("aiosqlite", "pysqlite"), future=True, echo=False)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, class_=Session)
Base = declarative_base()


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
