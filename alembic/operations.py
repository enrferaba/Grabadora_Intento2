"""Tiny subset of Alembic's operations facade.

The shim delegates to SQLAlchemy Core for DDL execution.  Only the helpers used
by the project's migrations are implemented.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import sqlalchemy as sa


@dataclass
class Operations:
    """Execute schema changes against a SQLAlchemy connection."""

    connection: sa.engine.Connection
    metadata: sa.MetaData

    def create_table(self, name: str, *columns: sa.Column, **kw) -> sa.Table:
        table = sa.Table(name, self.metadata, *columns, **kw)
        table.create(self.connection, checkfirst=True)
        return table

    def create_index(self, name: str, table_name: str, columns: Sequence[str]) -> sa.Index:
        table = self.metadata.tables.get(table_name)
        if table is None:
            table = sa.Table(table_name, self.metadata, autoload_with=self.connection)
        index = sa.Index(name, *[table.c[col] for col in columns])
        index.create(self.connection, checkfirst=True)
        return index

    # The production migrations do not call drop operations during the tests, so
    # they are intentionally omitted.  Implementations can be added if needed.


def _unbound_operations() -> None:  # pragma: no cover - defensive programming
    raise RuntimeError("Alembic operations are not bound to a connection")


class _OperationsProxy:
    """Lazy proxy that ensures a helpful error when unbound."""

    def __init__(self) -> None:
        self._ops: Operations | None = None
        self._metadata: sa.MetaData | None = None

    def bind(self, connection: sa.engine.Connection) -> None:
        self._metadata = sa.MetaData()
        self._ops = Operations(connection, self._metadata)

    def __getattr__(self, item):  # type: ignore[override]
        if self._ops is None:
            _unbound_operations()
        return getattr(self._ops, item)


op = _OperationsProxy()

