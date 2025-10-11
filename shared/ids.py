"""Utilities for generating stable identifiers."""
from __future__ import annotations

import secrets


def new_id(prefix: str) -> str:
    """Return a short, URL-safe identifier with the provided prefix."""

    suffix = secrets.token_urlsafe(6).replace("-", "").replace("_", "")
    return f"{prefix}_{suffix[:10]}"
