"""Compatibility hooks for third-party dependencies during testing."""
from __future__ import annotations

import inspect
import typing

ForwardRef = getattr(typing, "ForwardRef", None)
if ForwardRef is not None and hasattr(ForwardRef, "_evaluate"):
    try:
        signature = inspect.signature(ForwardRef._evaluate)
    except (ValueError, TypeError):
        signature = None

    if signature and "recursive_guard" in signature.parameters:
        parameter = signature.parameters["recursive_guard"]
        if parameter.default is inspect._empty:
            _original_evaluate = ForwardRef._evaluate

            accepts_positional = parameter.kind in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
            names = list(signature.parameters.keys())
            try:
                index = names.index("recursive_guard")
            except ValueError:
                index = -1

            slot = index - 1 if accepts_positional and index > 0 else None

            def _patched_evaluate(self, *args, **kwargs):
                if slot is not None and len(args) > slot:
                    kwargs.pop("recursive_guard", None)
                else:
                    kwargs.setdefault("recursive_guard", set())
                return _original_evaluate(self, *args, **kwargs)

            ForwardRef._evaluate = _patched_evaluate
