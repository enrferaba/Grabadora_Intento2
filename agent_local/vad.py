"""Voice activity detection with optional webrtcvad support."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np


@dataclass(slots=True)
class VadConfig:
    frame_duration_ms: int
    min_speech_ms: int
    min_silence_ms: int


class VoiceActivityDetector:
    """Simple VAD wrapper that uses webrtcvad when available."""

    def __init__(self, config: VadConfig) -> None:
        self.config = config
        try:
            import webrtcvad  # type: ignore

            self._vad = webrtcvad.Vad(3)
        except Exception:  # pragma: no cover - optional dependency
            self._vad = None

    def detect(self, audio: np.ndarray, sample_rate: int) -> List[slice]:
        if audio.size == 0:
            return []
        frame_samples = int(sample_rate * (self.config.frame_duration_ms / 1000))
        if frame_samples <= 0:
            raise ValueError("frame duration too small")

        if self._vad is None:
            return self._energy_based(audio, frame_samples)
        return self._webrtc_based(audio, sample_rate, frame_samples)

    def _energy_based(self, audio: np.ndarray, frame_samples: int) -> List[slice]:
        energy = np.abs(audio)
        threshold = np.percentile(energy, 75) * 0.5
        slices: List[slice] = []
        start = None
        silence_frames = 0
        for idx in range(0, len(audio), frame_samples):
            frame = energy[idx : idx + frame_samples]
            if frame.mean() > threshold:
                if start is None:
                    start = idx
                silence_frames = 0
            else:
                silence_frames += 1
                if start is not None and silence_frames * self.config.frame_duration_ms >= self.config.min_silence_ms:
                    end = idx
                    if (end - start) * 1000 / sample_rate >= self.config.min_speech_ms:
                        slices.append(slice(start, end))
                    start = None
        if start is not None:
            slices.append(slice(start, len(audio)))
        return slices

    def _webrtc_based(self, audio: np.ndarray, sample_rate: int, frame_samples: int) -> List[slice]:
        import webrtcvad  # type: ignore

        vad: webrtcvad.Vad = self._vad  # type: ignore
        bytes_per_sample = 2
        pcm = np.clip(audio * 32767, -32768, 32767).astype(np.int16).tobytes()
        slices: List[slice] = []
        start = None
        silence_ms = 0
        for idx in range(0, len(pcm), frame_samples * bytes_per_sample):
            frame = pcm[idx : idx + frame_samples * bytes_per_sample]
            if len(frame) < frame_samples * bytes_per_sample:
                break
            is_speech = vad.is_speech(frame, sample_rate)
            if is_speech:
                if start is None:
                    start = idx // bytes_per_sample
                silence_ms = 0
            else:
                silence_ms += self.config.frame_duration_ms
                if start is not None and silence_ms >= self.config.min_silence_ms:
                    end = idx // bytes_per_sample
                    duration_ms = (end - start) * 1000 / sample_rate
                    if duration_ms >= self.config.min_speech_ms:
                        slices.append(slice(start, end))
                    start = None
        if start is not None:
            slices.append(slice(start, len(audio)))
        return slices
