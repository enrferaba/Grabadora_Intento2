"""Backend synchronization package."""
from __future__ import annotations

import sys
import typing


if sys.version_info >= (3, 12):  # pragma: no cover - environment dependent
    original = typing.ForwardRef._evaluate

    def _patched_forward_ref_evaluate(self, globalns, localns, type_params=None, *, recursive_guard=None):
        if recursive_guard is None:
            recursive_guard = set()
        return original(self, globalns, localns, type_params, recursive_guard=recursive_guard)

    typing.ForwardRef._evaluate = _patched_forward_ref_evaluate
