from __future__ import annotations

import importlib
import os
from typing import Iterator

import pytest

import sys
import typing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if sys.version_info >= (3, 12):  # pragma: no cover - test env specific
    _orig_forward_ref_evaluate = typing.ForwardRef._evaluate

    def _patched_forward_ref_evaluate(self, globalns, localns, type_params=None, *, recursive_guard=None):
        if recursive_guard is None:
            recursive_guard = set()
        return _orig_forward_ref_evaluate(self, globalns, localns, type_params, recursive_guard=recursive_guard)

    typing.ForwardRef._evaluate = _patched_forward_ref_evaluate


def _reload_backend_modules() -> None:
    import backend_sync.config
    import backend_sync.database
    import backend_sync.models
    import workers.llm_tasks

    importlib.reload(backend_sync.config)
    importlib.reload(backend_sync.database)
    importlib.reload(backend_sync.models)
    importlib.reload(workers.llm_tasks)


@pytest.fixture(scope="session")
def backend_setup(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    data_dir = tmp_path_factory.mktemp("data")
    os.environ["DATA_DIR"] = str(data_dir)
    os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{data_dir / 'db.sqlite3'}"
    os.environ["JWT_SECRET"] = "test-secret"
    _reload_backend_modules()
    import backend_sync.main

    importlib.reload(backend_sync.main)
    from backend_sync.database import Base, engine

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield None
