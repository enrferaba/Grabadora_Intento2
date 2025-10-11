"""Runtime patches to keep dependencies compatible with Python 3.12."""
from __future__ import annotations

import sys
import typing
from pathlib import Path


ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:  # pragma: no cover - startup helper
    sys.path.insert(0, str(ROOT))


if sys.version_info >= (3, 12):  # pragma: no cover - environment dependent
    _orig_forward_ref_evaluate = typing.ForwardRef._evaluate

    def _patched_forward_ref_evaluate(self, globalns, localns, type_params=None, *, recursive_guard=None):
        if recursive_guard is None:
            recursive_guard = set()
        return _orig_forward_ref_evaluate(self, globalns, localns, type_params, recursive_guard=recursive_guard)

    typing.ForwardRef._evaluate = _patched_forward_ref_evaluate
