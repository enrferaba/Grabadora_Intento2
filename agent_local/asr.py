"""Incremental transcription utilities."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional

import numpy as np

from .hardware import detect_hardware


@dataclass(slots=True)
class Segment:
    text: str
    start: float
    end: float
    confidence: float
    speaker: Optional[str]


class IncrementalTranscriber:
    """Wrapper around faster-whisper with graceful fallbacks."""

    def __init__(self, model_size: str = "small") -> None:
        self.model_size = model_size
        self._model = None
        self._device = None
        self._load_model()

    def _load_model(self) -> None:
        profile = detect_hardware()
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception:  # pragma: no cover - optional dependency
            WhisperModel = None  # type: ignore

        if WhisperModel is None:
            self._model = None
            self._device = "cpu"
            return

        self._model = WhisperModel(
            self.model_size,
            device=profile.device,
            compute_type=profile.compute_type,
        )
        self._device = profile.device

    def transcribe(self, audio: np.ndarray, sample_rate: int, start_ts: float) -> List[Segment]:
        if audio.size == 0:
            return []
        if self._model is None:
            text = "".join("la" for _ in range(int(len(audio) / sample_rate * 2)))
            return [Segment(text=text or "(silencio)", start=start_ts, end=start_ts + len(audio) / sample_rate, confidence=0.5, speaker=None)]

        segments, _ = self._model.transcribe(
            audio,
            beam_size=1,
            temperature=[0.0, 0.2],
            patience=0,
            vad_filter=True,
            word_timestamps=True,
            compression_ratio_threshold=2.6,
        )
        results: List[Segment] = []
        for seg in segments:
            results.append(
                Segment(
                    text=seg.text.strip(),
                    start=start_ts + float(seg.start),
                    end=start_ts + float(seg.end),
                    confidence=float(getattr(seg, "avg_logprob", 0.0) + 1.0) / 2.0,
                    speaker=None,
                )
            )
        if not results:
            duration = len(audio) / sample_rate
            results.append(Segment(text="(sin voz)", start=start_ts, end=start_ts + duration, confidence=0.3, speaker=None))
        return results
