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

    accepts_positional = parameter.kind in (
        inspect.Parameter.POSITIONAL_ONLY,
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
    )
    param_names = list(signature.parameters.keys())
    try:
        param_index = param_names.index("recursive_guard")
    except ValueError:
        param_index = -1

    positional_slot = param_index - 1 if accepts_positional and param_index > 0 else None

    def _patched(self, *args, **kwargs):  # type: ignore[override]
        if positional_slot is not None and len(args) > positional_slot:
            kwargs.pop("recursive_guard", None)
        else:
            kwargs.setdefault("recursive_guard", set())
        return original(self, *args, **kwargs)

    forward_ref._evaluate = _patched  # type: ignore[assignment]


_patch_forward_ref()

