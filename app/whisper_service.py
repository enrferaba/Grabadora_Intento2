from __future__ import annotations

import logging
from dataclasses import dataclass
from inspect import signature
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
    def __init__(self, model_size: str, device_preference: str) -> None:
        if whisperx is None:
            raise RuntimeError("whisperx is not installed")
        self._model = None
        self._align_model = None
        self._diarize_pipeline = None
        self._lock = Lock()
        self.model_size = model_size
        self.device_preference = device_preference
        self._cached_asr_options: Optional[dict] = None

    @staticmethod
    def _normalize_device(device: str) -> str:
        if device.lower() in {"cuda", "gpu"}:
            return "cuda"
        return "cpu"

    @staticmethod
    def _compute_type_for_device(device: str) -> str:
        normalized = WhisperXTranscriber._normalize_device(device)
        if normalized == "cuda":
            return settings.whisper_compute_type or "float16"
        return "int8"

    def _compute_multilingual_flag(self) -> bool:
        """Infer whether the transcription should run in multilingual mode."""
        if settings.whisper_language:
            return settings.whisper_language.lower() != "en"
        return not self.model_size.endswith(".en")

    def _build_asr_options(self) -> dict:
        """Return WhisperX ASR options compatible with newer faster-whisper versions."""
        if self._cached_asr_options is not None:
            return self._cached_asr_options

        base_options = {
            "beam_size": 5,
            "best_of": 5,
            "patience": 1,
            "length_penalty": 1,
            "repetition_penalty": 1,
            "no_repeat_ngram_size": 0,
            "temperatures": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            "compression_ratio_threshold": 2.4,
            "log_prob_threshold": -1.0,
            "no_speech_threshold": 0.6,
            "condition_on_previous_text": False,
            "prompt_reset_on_temperature": 0.5,
            "initial_prompt": None,
            "prefix": None,
            "suppress_blank": True,
            "suppress_tokens": [-1],
            "without_timestamps": True,
            "max_initial_timestamp": 0.0,
            "word_timestamps": False,
            "prepend_punctuations": "\"'“¿([{-",
            "append_punctuations": "\"'.。,，!！?？:：”)]}、",
            "multilingual": self._compute_multilingual_flag(),
            "max_new_tokens": None,
            "clip_timestamps": "0",
            "hallucination_silence_threshold": None,
            "hotwords": None,
            "suppress_numerals": False,
        }

        normalized = base_options.copy()
        try:  # pragma: no cover - exercised in unit tests with monkeypatch
            from faster_whisper.transcribe import TranscriptionOptions  # type: ignore

            compat_defaults = {
                "multilingual": base_options["multilingual"],
                "max_new_tokens": None,
                "clip_timestamps": "0",
                "hallucination_silence_threshold": None,
                "hotwords": None,
            }

            sig = signature(TranscriptionOptions.__init__)
            assembled: dict = {}
            for name, param in sig.parameters.items():
                if name == "self":
                    continue
                if name in normalized:
                    assembled[name] = normalized[name]
                elif name in compat_defaults:
                    assembled[name] = compat_defaults[name]
                elif param.default is not param.empty:
                    assembled[name] = param.default
            for key, value in normalized.items():
                assembled.setdefault(key, value)
            normalized = assembled
        except Exception:  # pragma: no cover - only triggered when faster-whisper not present
            pass

        self._cached_asr_options = normalized
        return normalized

    def _patch_default_asr_options(self) -> None:
        """Ensure WhisperX module defaults include the compatibility keys."""
        if whisperx is None:  # pragma: no cover - defensive
            return
        try:
            asr_module = getattr(whisperx, "asr", None)
            if asr_module is None:
                return

            compat = self._build_asr_options()
            default_opts = getattr(asr_module, "DEFAULT_ASR_OPTIONS", None)

            if isinstance(default_opts, dict):
                merged = compat.copy()
                merged.update(default_opts)
            else:
                merged = compat.copy()

            setattr(asr_module, "DEFAULT_ASR_OPTIONS", merged)
            logger.debug(
                "DEFAULT_ASR_OPTIONS actualizado con claves de compatibilidad: %s",
                ", ".join(sorted(compat.keys())),
            )
        except Exception as exc:  # pragma: no cover - logging para diagnósticos
            logger.debug("No se pudo parchear DEFAULT_ASR_OPTIONS de whisperx: %s", exc)

    def _ensure_model(self):
        if self._model is None:
            device = self._normalize_device(self.device_preference or settings.whisper_device)
            if device == "cuda" and torch is not None and not torch.cuda.is_available():
                logger.warning("CUDA not available, falling back to CPU")
                device = "cpu"
            compute_type = self._compute_type_for_device(device)
            logger.info("Loading whisperx model %s on %s", self.model_size, device)
            self._patch_default_asr_options()
            self._model = whisperx.load_model(  # type: ignore[attr-defined]
                self.model_size,
                device=device,
                compute_type=compute_type,
                language=settings.whisper_language,
                asr_options=self._build_asr_options(),
            )
            if settings.whisper_use_faster and hasattr(whisperx, "transcribe_with_vad"):
                logger.info("Enabled faster VAD transcription")
        if settings.whisper_enable_speaker_diarization and self._diarize_pipeline is None:
            logger.info("Loading diarization pipeline")
            self._diarize_pipeline = whisperx.DiarizationPipeline(
                use_auth_token=None,
                device=self._normalize_device(self.device_preference or settings.whisper_device),
            )

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


_transcriber_cache: dict[tuple[str, str], BaseTranscriber] = {}
_transcriber_lock = Lock()


def get_transcriber(
    model_size: Optional[str] = None,
    device_preference: Optional[str] = None,
) -> BaseTranscriber:
    if settings.enable_dummy_transcriber or whisperx is None:
        key = ("dummy", "dummy")
    else:
        resolved_model = model_size or settings.whisper_model_size
        resolved_device = (device_preference or settings.whisper_device or "cuda").lower()
        key = (resolved_model, resolved_device)

    with _transcriber_lock:
        transcriber = _transcriber_cache.get(key)
        if transcriber is None:
            if settings.enable_dummy_transcriber or whisperx is None:
                transcriber = DummyTranscriber()
            else:
                transcriber = WhisperXTranscriber(key[0], key[1])
            _transcriber_cache[key] = transcriber
    return transcriber


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
