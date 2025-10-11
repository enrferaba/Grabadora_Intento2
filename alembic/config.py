"""Minimal configuration object used by the Alembic shim.

Only the features that are exercised by our tests are implemented.  The real
``alembic.config.Config`` exposes many more helpers; whenever the project grows
enough to require them the shim can be extended or replaced with the official
library.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict


class Config:
    """Store configuration options for the migration runner."""

    def __init__(self, config_file_name: str | None = None) -> None:
        self.config_file_name = config_file_name
        self._main_options: Dict[str, str] = {}

        if config_file_name:
            # Mirror Alembic's behaviour by storing the directory of the ini
            # file, which is later used to resolve relative script locations.
            path = Path(config_file_name).resolve()
            self._main_options.setdefault("here", str(path.parent))

    def set_main_option(self, key: str, value: str) -> None:
        self._main_options[key] = value

    def get_main_option(self, key: str) -> str:
        return self._main_options[key]

