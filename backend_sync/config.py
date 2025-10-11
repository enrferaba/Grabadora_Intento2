"""Runtime settings for the backend sync service."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(slots=True)
class Settings:
    database_url: str
    jwt_secret: str
    token_ttl_minutes: int = 15
    refresh_ttl_minutes: int = 60 * 24

    @property
    def data_dir(self) -> Path:
        return Path(os.getenv("DATA_DIR", "./data")).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/backend.db"),
        jwt_secret=os.getenv("JWT_SECRET", "secret-test-key"),
    )
