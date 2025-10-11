"""Hardware detection helpers for the local agent."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(slots=True)
class HardwareProfile:
    device: Literal["cpu", "cuda"]
    compute_type: str


def detect_hardware() -> HardwareProfile:
    """Detect GPU availability using torch if present."""

    try:
        import torch
    except Exception:  # pragma: no cover - torch is optional
        torch = None  # type: ignore

    if torch is not None and torch.cuda.is_available():  # pragma: no branch - simple check
        return HardwareProfile(device="cuda", compute_type="int8_float16")
    return HardwareProfile(device="cpu", compute_type="int8")
