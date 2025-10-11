"""Lightweight Alembic compatibility layer for offline testing.

This project depends on Alembic for schema migrations, but the execution
environment used for the kata does not allow installing the real Alembic
package.  To keep the migration workflow testable we provide a very small
subset of the public API that our migrations and tests rely on.

The goal of this shim is not to be feature complete; it only supports the
operations required by the baseline migration and the test suite:

* :mod:`alembic.config` exposes :class:`Config` with ``set_main_option`` /
  ``get_main_option`` helpers.
* :mod:`alembic.command` exposes :func:`upgrade` that loads migration modules
  from the configured ``script_location`` and executes their ``upgrade``
  function.
* :data:`alembic.op` provides ``create_table`` and ``create_index`` helpers
  backed by SQLAlchemy in order to mimic Alembic's operations facade.

The code is intentionally small and well documented so that swapping it for the
real Alembic package in production remains straightforward: simply install the
official dependency and delete this compatibility module.
"""

from . import command  # noqa: F401
from . import config  # noqa: F401
from .operations import Operations, op  # noqa: F401

__all__ = ["command", "config", "Operations", "op"]

