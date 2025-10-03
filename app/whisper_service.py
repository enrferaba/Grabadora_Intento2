from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import List, Optional

from pydub import AudioSegment

from .config import settings

try:
    import torch
except Exception:  # pragma: no cover - torch might not be available in tests
    torch = None  # type: ignore

try:
    import whisperx  # type: ignore
except Exception:  # pragma: no cover - optional dependency in CI
    whisperx = None  # type: ignore


logger = logging.getLogger(__name__)


@dataclass
class SegmentResult:
    start: float
    end: float
    speaker: str
    text: str


@dataclass
class TranscriptionResult:
    text: str
    language: Optional[str]
    duration: Optional[float]
    segments: List[SegmentResult]


class BaseTranscriber:
    def transcribe(self, audio_path: Path, language: Optional[str] = None) -> TranscriptionResult:
        raise NotImplementedError


class DummyTranscriber(BaseTranscriber):
    def transcribe(self, audio_path: Path, language: Optional[str] = None) -> TranscriptionResult:  # pragma: no cover - trivial
        logger.warning("Using DummyTranscriber, install whisperx to enable real transcription")
        dummy_text = f"Transcripción simulada para {audio_path.name}"
        return TranscriptionResult(
            text=dummy_text,
            language=language or "es",
            duration=None,
            segments=[SegmentResult(start=0, end=0, speaker="SPEAKER_00", text=dummy_text)],
        )


class WhisperXTranscriber(BaseTranscriber):
    def __init__(self) -> None:
        if whisperx is None:
            raise RuntimeError("whisperx is not installed")
        self._model = None
        self._align_model = None
        self._diarize_pipeline = None
        self._lock = Lock()

    def _ensure_model(self):
        if self._model is None:
            device = settings.whisper_device
            if device == "cuda" and torch is not None and not torch.cuda.is_available():
                logger.warning("CUDA not available, falling back to CPU")
                device = "cpu"
            logger.info("Loading whisperx model %s on %s", settings.whisper_model_size, device)
            self._model = whisperx.load_model(  # type: ignore[attr-defined]
                settings.whisper_model_size,
                device=device,
                compute_type=settings.whisper_compute_type,
                language=settings.whisper_language,
            )
            if settings.whisper_use_faster and hasattr(whisperx, "transcribe_with_vad"):
                logger.info("Enabled faster VAD transcription")
        if settings.whisper_enable_speaker_diarization and self._diarize_pipeline is None:
            logger.info("Loading diarization pipeline")
            self._diarize_pipeline = whisperx.DiarizationPipeline(use_auth_token=None, device=settings.whisper_device)

    def _estimate_duration(self, audio_path: Path) -> Optional[float]:
        try:
            audio = AudioSegment.from_file(audio_path)
            return len(audio) / 1000.0
        except Exception as exc:  # pragma: no cover - depends on ffmpeg availability
            logger.debug("Unable to estimate duration for %s: %s", audio_path, exc)
            return None

    def transcribe(self, audio_path: Path, language: Optional[str] = None) -> TranscriptionResult:
        with self._lock:
            self._ensure_model()
        assert self._model is not None

        logger.info("Starting transcription for %s", audio_path)
        audio = whisperx.load_audio(str(audio_path))
        model_output = self._model.transcribe(
            audio,
            batch_size=settings.whisper_batch_size,
            language=language or settings.whisper_language,
        )

        segments = model_output.get("segments", [])
        diarized_segments = segments
        if settings.whisper_enable_speaker_diarization and self._diarize_pipeline is not None:
            diarize_segments = self._diarize_pipeline(audio)
            diarized_segments = whisperx.assign_word_speakers(diarize_segments, segments)

        segment_results: List[SegmentResult] = []
        collected_text: List[str] = []
        for segment in diarized_segments:
            text = segment.get("text", "").strip()
            speaker = segment.get("speaker", "SPEAKER_00")
            start = float(segment.get("start", 0))
            end = float(segment.get("end", 0))
            collected_text.append(text)
            segment_results.append(SegmentResult(start=start, end=end, speaker=speaker, text=text))

        duration = self._estimate_duration(audio_path)

        return TranscriptionResult(
            text=" ".join(collected_text).strip(),
            language=model_output.get("language", language),
            duration=duration,
            segments=segment_results,
        )


_transcriber: Optional[BaseTranscriber] = None
_transcriber_lock = Lock()


def get_transcriber() -> BaseTranscriber:
    global _transcriber
    if _transcriber is None:
        with _transcriber_lock:
            if _transcriber is None:
                if settings.enable_dummy_transcriber or whisperx is None:
                    _transcriber = DummyTranscriber()
                else:
                    _transcriber = WhisperXTranscriber()
    return _transcriber


def serialize_segments(segments: List[SegmentResult]) -> List[dict]:
    return [
        {
            "start": segment.start,
            "end": segment.end,
            "speaker": segment.speaker,
            "text": segment.text,
        }
        for segment in segments
    ]
