"""Simplified migration runner used in the test environment."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Iterable, List

import sqlalchemy as sa

from .config import Config
from .operations import op


def _load_module(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(path.stem, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import migration module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _discover_migrations(script_location: str) -> List[ModuleType]:
    versions_dir = Path(script_location) / "versions"
    modules = [
        _load_module(path)
        for path in sorted(versions_dir.glob("*.py"))
        if path.name != "__init__.py"
    ]
    return modules


def upgrade(config: Config, revision: str) -> None:
    if revision != "head":  # pragma: no cover - defensive programming
        raise NotImplementedError("Only upgrade to 'head' is supported in tests")

    script_location = config.get_main_option("script_location")
    sqlalchemy_url = config.get_main_option("sqlalchemy.url")

    engine = sa.create_engine(sqlalchemy_url, future=True)
    with engine.begin() as connection:
        op.bind(connection)
        for module in _discover_migrations(script_location):
            upgrade_fn = getattr(module, "upgrade", None)
            if upgrade_fn is None:
                continue
            upgrade_fn()

