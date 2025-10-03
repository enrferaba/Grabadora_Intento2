"""Compatibility patches loaded early in the application lifecycle."""
from __future__ import annotations

import inspect
import typing


def _patch_forward_ref() -> None:
    """Backport the Python 3.13 ForwardRef signature for Pydantic 1.x."""

    forward_ref = getattr(typing, "ForwardRef", None)
    if forward_ref is None or not hasattr(forward_ref, "_evaluate"):
        return

    try:
        signature = inspect.signature(forward_ref._evaluate)  # type: ignore[attr-defined]
    except (TypeError, ValueError):
        return

    if "recursive_guard" not in signature.parameters:
        return

    parameter = signature.parameters["recursive_guard"]
    if parameter.default is not inspect._empty:
        return

    original = forward_ref._evaluate  # type: ignore[attr-defined]

    def _patched(self, *args, **kwargs):  # type: ignore[override]
        if "recursive_guard" not in kwargs:
            kwargs["recursive_guard"] = None
        return original(self, *args, **kwargs)

    forward_ref._evaluate = _patched  # type: ignore[assignment]


_patch_forward_ref()

