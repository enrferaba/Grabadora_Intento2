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

            def _patched_evaluate(self, globalns, localns, recursive_guard=None):
                return _original_evaluate(self, globalns, localns, recursive_guard)

            ForwardRef._evaluate = _patched_evaluate
