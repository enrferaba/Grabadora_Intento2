from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from inspect import signature
from pathlib import Path
from threading import Lock
from typing import Callable, Dict, List, Optional
from urllib.error import HTTPError, URLError

try:
    import torch
except Exception:  # pragma: no cover - torch might not be available in tests
    torch = None  # type: ignore

try:
    import whisperx  # type: ignore
except Exception:  # pragma: no cover - optional dependency in CI
    whisperx = None  # type: ignore

try:  # pragma: no cover - faster_whisper is an optional dependency in CI
    from faster_whisper import WhisperModel as FasterWhisperModel  # type: ignore
except Exception:  # pragma: no cover - handled gracefully in runtime
    FasterWhisperModel = None  # type: ignore

from pydub import AudioSegment

from .config import settings


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
    runtime_seconds: Optional[float] = None


class BaseTranscriber:
    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
    ) -> TranscriptionResult:
        raise NotImplementedError


class DummyTranscriber(BaseTranscriber):
    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
    ) -> TranscriptionResult:  # pragma: no cover - trivial
        logger.warning("Using DummyTranscriber, install whisperx to enable real transcription")
        dummy_text = f"Transcripción simulada para {audio_path.name}"
        if debug_callback:
            debug_callback(
                "dummy-transcriber",
                "Se utilizó el transcriptor simulado",
                {"filename": audio_path.name},
                "warning",
            )
        return TranscriptionResult(
            text=dummy_text,
            language=language or "es",
            duration=None,
            segments=[SegmentResult(start=0, end=0, speaker="SPEAKER_00", text=dummy_text)],
            runtime_seconds=0.0,
        )


class WhisperXVADUnavailableError(RuntimeError):
    """Raised when WhisperX cannot obtain the VAD model due to authentication issues."""


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
        self._vad_patch_done = False
        self._fallback_transcriber: Optional["FasterWhisperTranscriber"] = None

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

    def _download_vad_weights(self, debug_callback=None) -> Optional[Path]:
        try:
            from huggingface_hub import hf_hub_download  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dependency
            logger.warning("huggingface_hub no disponible para descargar VAD: %s", exc)
            if debug_callback:
                debug_callback(
                    "vad-download",
                    "huggingface_hub no disponible",
                    {"error": str(exc)},
                    "warning",
                )
            return None

        target_dir = Path(settings.models_cache_dir) / "vad"
        target_dir.mkdir(parents=True, exist_ok=True)
        try:
            local_path = hf_hub_download(
                repo_id=settings.whisper_vad_repo_id,
                filename=settings.whisper_vad_filename,
                cache_dir=str(target_dir),
                token=settings.huggingface_token or None,
                resume_download=True,
            )
            if debug_callback:
                debug_callback(
                    "vad-download",
                    "Modelo VAD descargado desde HuggingFace",
                    {"path": local_path},
                    "info",
                )
            return Path(local_path)
        except Exception as exc:  # pragma: no cover - network dependent
            logger.error("No se pudo descargar el modelo VAD: %s", exc)
            if debug_callback:
                debug_callback(
                    "vad-download",
                    "Fallo al descargar el modelo VAD",
                    {"error": str(exc)},
                    "error",
                )
            return None

    def _patch_vad_loader(self, debug_callback=None) -> None:
        if self._vad_patch_done or whisperx is None:  # pragma: no cover - defensive
            return
        try:
            vad_module = getattr(whisperx, "vad")
        except Exception:
            logger.debug("Módulo VAD de whisperx no disponible para parchear", exc_info=True)
            return

        original_loader = getattr(vad_module, "load_vad_model", None)
        if not callable(original_loader):
            return
        if getattr(original_loader, "_app_patched", False):
            self._vad_patch_done = True
            return

        def patched_loader(device, use_auth_token=None, **options):
            try:
                return original_loader(device, use_auth_token=use_auth_token, **options)
            except HTTPError as err:
                if debug_callback:
                    debug_callback(
                        "vad-download",
                        "Descarga VAD redirigida",
                        {"code": err.code, "url": getattr(vad_module, "VAD_SEGMENTATION_URL", "")},
                        "warning",
                    )
                if err.code in {301, 302, 307, 308, 401, 403}:
                    fallback_path = self._download_vad_weights(debug_callback=debug_callback)
                    if fallback_path:
                        options = dict(options)
                        options["segmentation_path"] = str(fallback_path)
                        return original_loader(device, use_auth_token=use_auth_token, **options)
                    raise WhisperXVADUnavailableError(
                        f"VAD model requires authentication (HTTP {err.code})"
                    ) from err
                logger.error("Fallo al cargar modelo VAD: %s", err)
                raise
            except URLError as err:
                if debug_callback:
                    debug_callback(
                        "vad-download",
                        "Error de red descargando VAD",
                        {"error": str(err)},
                        "warning",
                    )
                raise WhisperXVADUnavailableError("Unable to download VAD model (network error)") from err
            except Exception as err:
                # Cualquier otra excepción inesperada (por ejemplo, errores de socket en
                # entornos sin red) debería activar igualmente el modo fallback para
                # evitar que la aplicación se quede bloqueada intentando obtener el VAD.
                logger.warning("Error inesperado descargando VAD: %s", err)
                if debug_callback:
                    debug_callback(
                        "vad-download",
                        "Error inesperado descargando VAD",
                        {"error": str(err)},
                        "warning",
                    )
                raise WhisperXVADUnavailableError("Unexpected error downloading VAD model") from err

        patched_loader._app_patched = True  # type: ignore[attr-defined]
        vad_module.load_vad_model = patched_loader  # type: ignore[attr-defined]

        # Algunos submódulos de whisperx (por ejemplo asr.py) importan load_vad_model
        # directamente. Si no actualizamos también esa referencia seguirán utilizando
        # la versión original sin fallback y el HTTPError 301 reaparece.
        try:
            asr_module = getattr(whisperx, "asr", None)
        except Exception:  # pragma: no cover - defensivo
            asr_module = None
        if asr_module is not None:
            current_attr = getattr(asr_module, "load_vad_model", None)
            if current_attr is None or current_attr is original_loader:
                setattr(asr_module, "load_vad_model", patched_loader)

        current_url = getattr(vad_module, "VAD_SEGMENTATION_URL", "")
        if isinstance(current_url, str) and current_url.startswith("http://"):
            setattr(vad_module, "VAD_SEGMENTATION_URL", current_url.replace("http://", "https://", 1))
        self._vad_patch_done = True

    def _ensure_model(self, debug_callback=None):
        if self._model is None:
            device = self._normalize_device(self.device_preference or settings.whisper_device)
            if device == "cuda" and torch is not None and not torch.cuda.is_available():
                logger.warning("CUDA not available, falling back to CPU")
                device = "cpu"
            compute_type = self._compute_type_for_device(device)
            logger.info("Loading whisperx model %s on %s", self.model_size, device)
            if debug_callback:
                debug_callback(
                    "load-model",
                    "Preparando modelo whisperx",
                    {"model": self.model_size, "device": device, "compute_type": compute_type},
                    "info",
                )
            self._patch_default_asr_options()
            self._patch_vad_loader(debug_callback=debug_callback)
            try:
                self._model = whisperx.load_model(  # type: ignore[attr-defined]
                    self.model_size,
                    device=device,
                    compute_type=compute_type,
                    language=settings.whisper_language,
                    asr_options=self._build_asr_options(),
                )
            except WhisperXVADUnavailableError:
                self._model = None
                if debug_callback:
                    debug_callback(
                        "load-model",
                        "VAD protegido: usando fallback faster-whisper",
                        {"model": self.model_size, "device": device},
                        "warning",
                    )
                raise
            if settings.whisper_use_faster and hasattr(whisperx, "transcribe_with_vad"):
                logger.info("Enabled faster VAD transcription")
                if debug_callback:
                    debug_callback(
                        "load-model",
                        "Transcripción con VAD acelerado disponible",
                        {"enabled": True},
                        "info",
                    )
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

    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
    ) -> TranscriptionResult:
        def emit(stage: str, message: str, extra: Optional[Dict[str, object]] = None, level: str = "info") -> None:
            if debug_callback:
                debug_callback(stage, message, extra, level)

        try:
            with self._lock:
                self._ensure_model(debug_callback=emit)
        except WhisperXVADUnavailableError as exc:
            emit(
                "load-model",
                "WhisperX no disponible (VAD restringido); usando fallback",
                {"error": str(exc)},
                "warning",
            )
            fallback = self._get_fallback_transcriber()
            return fallback.transcribe(audio_path, language=language, debug_callback=debug_callback)

        assert self._model is not None

        logger.info("Starting transcription for %s", audio_path)
        emit(
            "transcribe.start",
            "Comenzando transcripción",
            {"filename": audio_path.name, "language": language or settings.whisper_language},
        )
        audio = whisperx.load_audio(str(audio_path))
        start = time.perf_counter()
        try:
            model_output = self._model.transcribe(
                audio,
                batch_size=settings.whisper_batch_size,
                language=language or settings.whisper_language,
            )
        except Exception as exc:
            emit(
                "transcribe.error",
                "Error ejecutando whisperx.transcribe",
                {"error": str(exc)},
                "error",
            )
            raise
        runtime = time.perf_counter() - start
        emit(
            "transcribe.completed",
            "Transcripción finalizada",
            {"runtime_seconds": runtime, "segment_count": len(model_output.get("segments", []))},
        )

        segments = model_output.get("segments", [])
        diarized_segments = segments
        if settings.whisper_enable_speaker_diarization and self._diarize_pipeline is not None:
            emit("diarization.start", "Iniciando diarización", None)
            diarize_segments = self._diarize_pipeline(audio)
            diarized_segments = whisperx.assign_word_speakers(diarize_segments, segments)
            emit(
                "diarization.completed",
                "Diarización completada",
                {"segments": len(diarized_segments)},
            )

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
            runtime_seconds=runtime,
        )

    def _get_fallback_transcriber(self) -> "FasterWhisperTranscriber":
        with self._lock:
            if self._fallback_transcriber is None:
                self._fallback_transcriber = FasterWhisperTranscriber(
                    self.model_size,
                    self.device_preference,
                )
        return self._fallback_transcriber


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


class FasterWhisperTranscriber(BaseTranscriber):
    """Fallback transcriber that relies solely on faster-whisper."""

    def __init__(self, model_size: str, device_preference: str) -> None:
        if FasterWhisperModel is None:
            raise RuntimeError("faster_whisper is not installed")
        self.model_size = model_size
        self.device_preference = device_preference
        self._model: Optional[FasterWhisperModel] = None  # type: ignore[type-arg]
        self._lock = Lock()

    def _resolve_device(self) -> str:
        preferred = (self.device_preference or settings.whisper_device or "cpu").lower()
        if preferred in {"cuda", "gpu"} and torch is not None and torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def _resolve_compute_type(self, device: str) -> str:
        if device == "cuda":
            return settings.whisper_compute_type or "float16"
        return "int8"

    def _candidate_compute_types(self, device: str) -> List[str]:
        preferred = self._resolve_compute_type(device)
        if device == "cuda":
            fallbacks = ["float16", "int8_float16", "float32", "int8_float32", "int8"]
        else:
            fallbacks = ["int8", "int8_float32", "int8_float16", "float32"]

        candidates: List[str] = []
        for option in [preferred, *fallbacks]:
            if option not in candidates:
                candidates.append(option)
        return candidates

    def _candidate_devices(self, initial_device: str) -> List[str]:
        devices = [initial_device]
        if initial_device == "cuda":
            devices.append("cpu")
        return devices

    def _ensure_model(self, debug_callback=None) -> None:
        if self._model is not None:
            return
        initial_device = self._resolve_device()
        last_error: Optional[Exception] = None

        for device in self._candidate_devices(initial_device):
            for compute_type in self._candidate_compute_types(device):
                try:
                    if debug_callback:
                        debug_callback(
                            "load-model",
                            "Cargando modelo faster-whisper de respaldo",
                            {
                                "model": self.model_size,
                                "device": device,
                                "compute_type": compute_type,
                            },
                            "info",
                        )
                    self._model = FasterWhisperModel(  # type: ignore[call-arg]
                        self.model_size,
                        device=device,
                        compute_type=compute_type,
                        download_root=str(settings.models_cache_dir),
                    )
                    if device == "cuda" and torch is not None:
                        torch.cuda.empty_cache()
                    return
                except Exception as exc:  # pragma: no cover - depends on runtime environment
                    last_error = exc
                    if torch is not None and device == "cuda":
                        try:
                            torch.cuda.empty_cache()
                        except Exception:
                            pass
                    if debug_callback:
                        debug_callback(
                            "load-model.retry",
                            "Reintentando carga de modelo faster-whisper",
                            {
                                "model": self.model_size,
                                "device": device,
                                "compute_type": compute_type,
                                "error": str(exc),
                            },
                            "warning",
                        )
        if last_error is not None:
            raise last_error
        raise RuntimeError("Unable to load faster-whisper model with available configurations")

    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
    ) -> TranscriptionResult:
        def emit(stage: str, message: str, extra: Optional[Dict[str, object]] = None, level: str = "info") -> None:
            if debug_callback:
                debug_callback(stage, message, extra, level)

        with self._lock:
            self._ensure_model(debug_callback=emit)
        assert self._model is not None

        attempts = [True, False]
        last_error: Optional[BaseException] = None
        runtime = 0.0
        segments = None
        info = None

        for use_vad in attempts:
            try:
                start = time.perf_counter()
                segments, info = self._model.transcribe(  # type: ignore[attr-defined]
                    str(audio_path),
                    language=language or settings.whisper_language,
                    beam_size=5,
                    vad_filter=use_vad,
                )
                runtime = time.perf_counter() - start
                if not use_vad:
                    emit(
                        "transcribe.retry",
                        "Reintento completado sin filtro VAD",
                        {"runtime_seconds": runtime},
                        "warning",
                    )
                break
            except (HTTPError, URLError) as exc:
                last_error = exc
                if use_vad:
                    emit(
                        "transcribe.retry",
                        "Fallo al aplicar VAD remoto, reintentando sin VAD",
                        {"error": str(exc)},
                        "warning",
                    )
                    continue
                raise

        if segments is None or info is None:
            assert last_error is not None
            raise last_error

        emit(
            "transcribe.completed",
            "Transcripción con faster-whisper completada",
            {"runtime_seconds": runtime},
        )

        segment_results: List[SegmentResult] = []
        collected_text: List[str] = []
        for index, segment in enumerate(segments):
            text = getattr(segment, "text", "").strip()
            if not text:
                continue
            collected_text.append(text)
            segment_results.append(
                SegmentResult(
                    start=float(getattr(segment, "start", 0.0)),
                    end=float(getattr(segment, "end", 0.0)),
                    speaker="SPEAKER_00",
                    text=text,
                )
            )
            emit(
                "transcribe.segment",
                "Segmento transcrito",
                {
                    "index": index,
                    "start": float(getattr(segment, "start", 0.0)),
                    "end": float(getattr(segment, "end", 0.0)),
                    "text": text,
                    "partial_text": " ".join(collected_text).strip(),
                },
            )

        language_result = getattr(info, "language", language)
        duration = getattr(info, "duration", None)

        return TranscriptionResult(
            text=" ".join(collected_text).strip(),
            language=language_result,
            duration=duration,
            segments=segment_results,
            runtime_seconds=runtime,
        )
