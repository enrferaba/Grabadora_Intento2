from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from inspect import signature
from pathlib import Path
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Lock
from typing import Callable, Dict, List, Optional, Tuple
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
class ModelPreparationInfo:
    status: str = "idle"
    progress: int = 0
    message: str = "Pendiente"
    error: Optional[str] = None
    updated_at: float = field(default_factory=time.time)


_model_progress_lock = Lock()
_model_progress: Dict[Tuple[str, str], ModelPreparationInfo] = {}
_model_futures_lock = Lock()
_model_futures: Dict[Tuple[str, str], Future] = {}
_model_executor = ThreadPoolExecutor(max_workers=2)


def _model_progress_key(model_size: Optional[str], device: Optional[str]) -> Tuple[str, str]:
    normalized_model = (model_size or settings.whisper_model_size or "large-v2").strip()
    if not normalized_model:
        normalized_model = settings.whisper_model_size or "large-v2"
    normalized_device = (device or settings.whisper_device or "cuda").lower()
    return normalized_model, normalized_device


def _copy_model_info(info: ModelPreparationInfo) -> ModelPreparationInfo:
    return ModelPreparationInfo(
        status=info.status,
        progress=info.progress,
        message=info.message,
        error=info.error,
        updated_at=info.updated_at,
    )


def _update_model_progress(
    key: Tuple[str, str],
    status: str,
    progress: int,
    message: str,
    *,
    error: Optional[str] = None,
) -> ModelPreparationInfo:
    clamped = max(0, min(int(progress), 100))
    with _model_progress_lock:
        current = _model_progress.get(key, ModelPreparationInfo())
        current.status = status
        current.progress = clamped
        current.message = message
        current.error = error
        current.updated_at = time.time()
        _model_progress[key] = current
        return _copy_model_info(current)


def get_model_preparation_status(model_size: Optional[str], device: Optional[str]) -> ModelPreparationInfo:
    key = _model_progress_key(model_size, device)
    with _model_progress_lock:
        info = _model_progress.get(key)
        if info is None:
            info = ModelPreparationInfo()
            _model_progress[key] = info
        return _copy_model_info(info)


def _progress_callback_factory(key: Tuple[str, str]) -> Callable[[int, str], None]:
    def _callback(progress: int, message: str) -> None:
        status = "ready" if progress >= 100 else "downloading"
        _update_model_progress(key, status, progress, message)

    return _callback


def prepare_transcriber(
    model_size: Optional[str] = None,
    device_preference: Optional[str] = None,
    *,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> BaseTranscriber:
    transcriber = get_transcriber(model_size, device_preference)
    try:
        transcriber.prepare(progress_callback=progress_callback)
    except AttributeError:
        # Backwards compatibility in case a custom transcriber does not implement prepare.
        if progress_callback:
            progress_callback(100, "Modelo listo para usar.")
    return transcriber


def _prepare_model_task(model_size: str, device: str) -> None:
    key = _model_progress_key(model_size, device)
    callback = _progress_callback_factory(key)
    try:
        callback(5, f"Comprobando caché de {model_size} ({device}).")
        prepare_transcriber(model_size, device, progress_callback=callback)
        _update_model_progress(
            key,
            "ready",
            100,
            f"Modelo {model_size} listo en {device}.",
        )
    except Exception as exc:  # pragma: no cover - dependerá del runtime
        logger.exception("No se pudo preparar el modelo %s (%s)", model_size, device)
        _update_model_progress(
            key,
            "error",
            0,
            f"Error preparando {model_size}: {exc}",
            error=str(exc),
        )


def request_model_preparation(model_size: Optional[str], device: Optional[str]) -> ModelPreparationInfo:
    key = _model_progress_key(model_size, device)
    info = get_model_preparation_status(model_size, device)
    if info.status == "ready":
        return info
    with _model_futures_lock:
        future = _model_futures.get(key)
        if future is None or future.done():
            resolved_model, resolved_device = key
            _update_model_progress(
                key,
                "checking",
                max(info.progress, 1),
                f"Preparando {resolved_model} en {resolved_device}…",
            )
            _model_futures[key] = _model_executor.submit(_prepare_model_task, resolved_model, resolved_device)
    return get_model_preparation_status(model_size, device)
def _resolve_cpu_threads() -> int:
    configured = getattr(settings, "cpu_threads", None)
    if configured:
        try:
            value = int(configured)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
    return max(1, os.cpu_count() or 1)


def _resolve_fw_num_workers() -> int:
    try:
        workers = int(getattr(settings, "fw_num_workers", 1))
    except (TypeError, ValueError):
        workers = 1
    return max(1, workers)


_langdet_lock = Lock()
_langdet_model: Optional[FasterWhisperModel] = None  # type: ignore[type-arg]


def _ensure_langdet_model(device: str) -> Optional[FasterWhisperModel]:
    global _langdet_model
    if FasterWhisperModel is None:
        return None
    with _langdet_lock:
        if _langdet_model is None:
            cpu_threads = _resolve_cpu_threads()
            num_workers = _resolve_fw_num_workers()
            try:
                _langdet_model = FasterWhisperModel(  # type: ignore[call-arg]
                    "tiny",
                    device="cuda" if device == "cuda" else "cpu",
                    compute_type="float16" if device == "cuda" else "int8",
                    cpu_threads=cpu_threads,
                    num_workers=num_workers,
                    download_root=str(getattr(settings, "models_cache_dir", ".")),
                )
            except Exception as exc:  # pragma: no cover - optional best-effort helper
                logger.debug("No se pudo cargar modelo tiny para detección rápida: %s", exc)
                _langdet_model = None
        return _langdet_model


def _detect_language_fast(
    audio_path: Path,
    device: str,
    debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
) -> Optional[str]:
    model = _ensure_langdet_model(device)
    if model is None:
        return None
    try:
        start = time.perf_counter()
        _, info = model.transcribe(str(audio_path), beam_size=1, vad_filter=True)
        language = getattr(info, "language", None)
        if debug_callback:
            debug_callback(
                "lang.detect",
                "Idioma detectado (tiny)",
                {
                    "language": language,
                    "ms": int((time.perf_counter() - start) * 1000),
                },
                "debug",
            )
        return language
    except Exception as exc:  # pragma: no cover - dependerá de runtime
        if debug_callback:
            debug_callback(
                "lang.detect.error",
                "Fallo detección rápida",
                {"error": str(exc)},
                "warning",
            )
        return None


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
        beam_size: Optional[int] = None,
        debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
    ) -> TranscriptionResult:
        raise NotImplementedError

    def prepare(
        self,
        *,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> None:  # pragma: no cover - trivial default implementation
        if progress_callback:
            progress_callback(100, "Modelo listo para usar.")


class DummyTranscriber(BaseTranscriber):
    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        beam_size: Optional[int] = None,
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

    def prepare(
        self,
        *,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> None:  # pragma: no cover - trivial
        if progress_callback:
            progress_callback(100, "Transcriptor simulado listo.")


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
        self._disabled_reason: Optional[str] = self._initial_disabled_reason()

    def _initial_disabled_reason(self) -> Optional[str]:
        """Determine whether WhisperX should be disabled from the start."""

        repo_id = (settings.whisper_vad_repo_id or "").strip().lower()
        if not repo_id:
            return None

        token = settings.huggingface_token or None
        if token:
            return None

        if repo_id.startswith("pyannote/") or "pyannote" in repo_id:
            return (
                "El modelo de VAD de WhisperX requiere autenticación en HuggingFace. "
                "Configura la variable HUGGINGFACE_TOKEN para habilitar la diarización."
            )

        return None

    @staticmethod
    def _normalize_device(device: str) -> str:
        desired = (device or settings.whisper_device or "cpu").lower()
        if desired not in {"cuda", "gpu"}:
            return "cpu"
        if settings.whisper_force_cuda:
            return "cuda"
        if torch is not None and torch.cuda.is_available():
            return "cuda"
        logger.warning(
            "CUDA solicitado pero no disponible; se usará CPU. Configure WHISPER_FORCE_CUDA=true para forzar GPU si su entorno lo soporta."
        )
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

        want_word_ts = bool(
            getattr(settings, "whisper_enable_speaker_diarization", False)
            or getattr(settings, "whisper_word_timestamps", False)
        )

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
            "without_timestamps": not want_word_ts,
            "max_initial_timestamp": 0.0,
            "word_timestamps": want_word_ts,
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
            self._disabled_reason = (
                "huggingface_hub no está disponible; WhisperX usará el fallback local."
            )
            return None

        token = settings.huggingface_token or None
        if token is None and settings.whisper_vad_repo_id.startswith("pyannote/"):
            message = (
                "El repositorio de VAD requiere autenticación en HuggingFace. Configura HUGGINGFACE_TOKEN "
                "para habilitar whisperx con diarización; se usará el fallback local mientras tanto."
            )
            logger.info(message)
            if debug_callback:
                debug_callback(
                    "vad-download",
                    "Repositorio VAD requiere autenticación",
                    {"repo": settings.whisper_vad_repo_id},
                    "warning",
                )
            self._disabled_reason = message
            return None

        target_dir = Path(settings.models_cache_dir) / "vad"
        target_dir.mkdir(parents=True, exist_ok=True)
        try:
            local_path = hf_hub_download(
                repo_id=settings.whisper_vad_repo_id,
                filename=settings.whisper_vad_filename,
                cache_dir=str(target_dir),
                token=token,
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
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code is None:
                status_code = getattr(exc, "code", None)
            if status_code in {401, 403}:
                logger.warning(
                    "No se pudo descargar el modelo VAD por falta de autorización (%s)",
                    status_code,
                )
                if debug_callback:
                    debug_callback(
                        "vad-download",
                        "Autenticación HuggingFace requerida para el VAD",
                        {"status_code": status_code, "error": str(exc)},
                        "warning",
                    )
                self._disabled_reason = (
                    "Autenticación de HuggingFace obligatoria para usar whisperx con diarización."
                )
                return None
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
                self._disabled_reason = "No se pudo descargar el VAD requerido por WhisperX (error de red)."
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
                self._disabled_reason = "Error inesperado descargando el modelo VAD de WhisperX."
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

    def _ensure_model(self, debug_callback=None, progress_callback: Optional[Callable[[int, str], None]] = None):
        if self._disabled_reason:
            raise WhisperXVADUnavailableError(self._disabled_reason)

        if self._model is None:
            preferred = self.device_preference or settings.whisper_device
            device = self._normalize_device(preferred)
            forced_cuda = device == "cuda" and not (
                torch is not None and torch.cuda.is_available()
            ) and settings.whisper_force_cuda
            compute_type = self._compute_type_for_device(device)
            if forced_cuda:
                logger.info("Forzando carga de whisperx %s en CUDA", self.model_size)
            else:
                logger.info("Loading whisperx model %s on %s", self.model_size, device)
            if debug_callback:
                debug_callback(
                    "load-model",
                    "Preparando modelo whisperx",
                    {
                        "model": self.model_size,
                        "device": device,
                        "compute_type": compute_type,
                        "forced_cuda": forced_cuda,
                    },
                    "info",
                )
            if progress_callback:
                progress_callback(15, f"Descargando modelo {self.model_size} ({device}).")
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
                if not self._disabled_reason:
                    self._disabled_reason = (
                        "WhisperX no está disponible porque el modelo de VAD requiere autenticación."
                    )
                if debug_callback:
                    debug_callback(
                        "load-model",
                        "VAD protegido: usando fallback faster-whisper",
                        {"model": self.model_size, "device": device},
                        "warning",
                    )
                raise
            if progress_callback:
                progress_callback(65, f"Modelo {self.model_size} cargado en {device}.")
            if (
                getattr(settings, "whisper_enable_speaker_diarization", False)
                or getattr(settings, "whisper_word_timestamps", False)
            ) and self._align_model is None:
                try:
                    self._align_model, _ = whisperx.load_align_model(  # type: ignore[attr-defined]
                        language=settings.whisper_language or "es",
                        device=device,
                    )
                    if debug_callback:
                        debug_callback(
                            "align.load",
                            "Modelo de alineación cargado",
                            {"language": settings.whisper_language or "auto"},
                            "info",
                        )
                    if progress_callback:
                        progress_callback(80, "Alineación preparada.")
                except Exception as exc:  # pragma: no cover - depende de runtime
                    logger.warning("No se pudo cargar align model: %s", exc)
                    self._align_model = None
                    if debug_callback:
                        debug_callback(
                            "align.load.error",
                            "No se pudo cargar align model",
                            {"error": str(exc)},
                            "warning",
                        )
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
            token = getattr(settings, "huggingface_token", None) or None
            try:
                self._diarize_pipeline = whisperx.DiarizationPipeline(  # type: ignore[attr-defined]
                    use_auth_token=token,
                    device=self._normalize_device(self.device_preference or settings.whisper_device),
                )
                if debug_callback:
                    debug_callback(
                        "diarization.load",
                        "Pipeline de diarización cargada",
                        {"token": bool(token)},
                        "info",
                    )
                if progress_callback:
                    progress_callback(90, "Diarización disponible.")
            except Exception as exc:  # pragma: no cover - red/network
                logger.warning("Diarization deshabilitada: %s", exc)
                self._diarize_pipeline = None
                if debug_callback:
                    debug_callback(
                        "diarization.load.error",
                        "No se pudo cargar la pipeline de diarización",
                        {"error": str(exc)},
                        "warning",
                    )
        if self._model is not None and progress_callback:
            progress_callback(100, f"WhisperX listo en {self._normalize_device(self.device_preference or settings.whisper_device)}.")

    def _estimate_duration(self, audio_path: Path) -> Optional[float]:
        try:
            import soundfile as sf  # type: ignore

            info = sf.info(str(audio_path))
            return float(info.frames) / float(info.samplerate)
        except Exception:
            try:
                audio = AudioSegment.from_file(audio_path)
                return len(audio) / 1000.0
            except Exception as exc:  # pragma: no cover - depends on ffmpeg availability
                logger.debug("Unable to estimate duration for %s: %s", audio_path, exc)
                return None

    def prepare(
        self,
        *,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> None:
        with self._lock:
            if self._model is not None:
                if progress_callback:
                    progress_callback(
                        100,
                        f"WhisperX listo en {self._normalize_device(self.device_preference or settings.whisper_device)}.",
                    )
                return
            self._ensure_model(progress_callback=progress_callback)

    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        beam_size: Optional[int] = None,
        debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
    ) -> TranscriptionResult:
        def emit(stage: str, message: str, extra: Optional[Dict[str, object]] = None, level: str = "info") -> None:
            if debug_callback:
                debug_callback(stage, message, extra, level)

        try:
            with self._lock:
                self._ensure_model(debug_callback=emit)
        except WhisperXVADUnavailableError as exc:
            if not self._disabled_reason:
                self._disabled_reason = str(exc) or (
                    "WhisperX deshabilitado: se utilizará faster-whisper en su lugar."
                )
            emit(
                "load-model",
                "WhisperX no disponible (VAD restringido); usando fallback",
                {"error": str(exc)},
                "warning",
            )
            fallback = self._get_fallback_transcriber()
            return fallback.transcribe(
                audio_path,
                language=language,
                beam_size=beam_size,
                debug_callback=debug_callback,
            )

        assert self._model is not None

        device = self._normalize_device(self.device_preference or settings.whisper_device)
        preferred = (self.device_preference or settings.whisper_device or "").lower()
        if preferred in {"cuda", "gpu"} and device != "cuda":
            emit(
                "device.unavailable",
                "CUDA no está disponible para WhisperX; se usará CPU",
                {
                    "requested": self.device_preference or settings.whisper_device or "auto",
                    "torch_cuda": bool(torch and torch.cuda.is_available()),
                },
                "warning",
            )
        if not language and not getattr(settings, "whisper_language", None):
            detected = _detect_language_fast(audio_path, device, debug_callback=emit)
            if detected:
                language = detected

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
            fallback = self._get_fallback_transcriber()
            emit(
                "transcribe.retry",
                "WhisperX falló; usando faster-whisper como respaldo",
                {"error": str(exc)},
                "warning",
            )
            return fallback.transcribe(
                audio_path,
                language=language,
                beam_size=beam_size,
                debug_callback=debug_callback,
            )
        runtime = time.perf_counter() - start
        emit(
            "transcribe.completed",
            "Transcripción finalizada",
            {"runtime_seconds": runtime, "segment_count": len(model_output.get("segments", []))},
        )

        segments = model_output.get("segments", [])
        word_segments = None
        if (
            (
                getattr(settings, "whisper_enable_speaker_diarization", False)
                or getattr(settings, "whisper_word_timestamps", False)
            )
            and self._align_model is not None
        ):
            emit("align.start", "Alineando a nivel de palabra", None)
            try:
                aligned = whisperx.align(  # type: ignore[attr-defined]
                    segments,
                    self._model,
                    self._align_model,
                    audio,
                    device=device,
                )
                segments = aligned.get("segments", segments)
                word_segments = aligned.get("word_segments", None)
                emit(
                    "align.completed",
                    "Alineación completada",
                    {"segments": len(segments)},
                )
            except Exception as exc:
                emit(
                    "align.error",
                    "Fallo alineando; continúo sin alineación",
                    {"error": str(exc)},
                    "warning",
                )

        diarized_segments = segments
        if settings.whisper_enable_speaker_diarization and self._diarize_pipeline is not None:
            emit("diarization.start", "Iniciando diarización", None)
            try:
                diar = self._diarize_pipeline(audio)
                diarized_segments = whisperx.assign_word_speakers(  # type: ignore[attr-defined]
                    diar,
                    word_segments or segments,
                )
                emit(
                    "diarization.completed",
                    "Diarización completada",
                    {"segments": len(diarized_segments)},
                )
            except Exception as exc:
                emit(
                    "diarization.error",
                    "Fallo diarizando; continúo sin diarización",
                    {"error": str(exc)},
                    "warning",
                )
                diarized_segments = segments

        segment_results: List[SegmentResult] = []
        collected_text: List[str] = []
        for index, segment in enumerate(diarized_segments):
            text = segment.get("text", "").strip()
            if not text:
                continue
            speaker = segment.get("speaker", "SPEAKER_00")
            start = float(segment.get("start", 0))
            end = float(segment.get("end", 0))
            collected_text.append(text)
            segment_results.append(
                SegmentResult(start=start, end=end, speaker=speaker, text=text)
            )
            emit(
                "transcribe.segment",
                "Segmento transcrito",
                {
                    "index": index,
                    "start": start,
                    "end": end,
                    "speaker": speaker,
                    "text": text,
                    "partial_text": " ".join(collected_text).strip(),
                },
                "debug",
            )

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
        if preferred in {"cuda", "gpu"}:
            if settings.whisper_force_cuda:
                return "cuda"
            if torch is not None and torch.cuda.is_available():
                return "cuda"
        return "cpu"

    def _current_device(self) -> str:
        if self._model is not None:
            device_attr = getattr(self._model, "device", None)
            if isinstance(device_attr, str):
                return device_attr
            if device_attr is not None:
                return str(device_attr)
        return self._resolve_device()

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
        if initial_device == "cuda" and not settings.whisper_force_cuda:
            devices.append("cpu")
        return devices

    def _ensure_model(
        self,
        debug_callback=None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> None:
        if self._model is not None:
            if progress_callback:
                progress_callback(100, f"faster-whisper listo en {self._current_device()}.")
            return

        def emit(
            stage: str,
            message: str,
            extra: Optional[Dict[str, object]] = None,
            level: str = "info",
        ) -> None:
            if debug_callback:
                debug_callback(stage, message, extra, level)

        requested_label = self.device_preference or settings.whisper_device or "auto"
        preferred = requested_label.lower()
        want_cuda = preferred in {"cuda", "gpu"}
        torch_available = bool(torch and torch.cuda.is_available())

        initial_device = self._resolve_device()
        if want_cuda and initial_device != "cuda":
            emit(
                "device.unavailable",
                "CUDA no está disponible para faster-whisper; se usará CPU",
                {
                    "requested": requested_label,
                    "torch_cuda": torch_available,
                    "force_cuda": bool(settings.whisper_force_cuda),
                },
                "warning",
            )

        last_error: Optional[Exception] = None
        cpu_threads = _resolve_cpu_threads()
        num_workers = _resolve_fw_num_workers()
        loaded_device: Optional[str] = None

        if progress_callback:
            progress_callback(25, f"Cargando {self.model_size} ({initial_device}).")

        for device in self._candidate_devices(initial_device):
            for compute_type in self._candidate_compute_types(device):
                forced_cuda = device == "cuda" and settings.whisper_force_cuda and not torch_available
                emit(
                    "load-model",
                    "Cargando modelo faster-whisper de respaldo",
                    {
                        "model": self.model_size,
                        "device": device,
                        "compute_type": compute_type,
                        "cpu_threads": cpu_threads,
                        "num_workers": num_workers,
                        "forced_cuda": forced_cuda,
                    },
                    "info",
                )
                try:
                    self._model = FasterWhisperModel(  # type: ignore[call-arg]
                        self.model_size,
                        device=device,
                        compute_type=compute_type,
                        cpu_threads=cpu_threads,
                        num_workers=num_workers,
                        download_root=str(settings.models_cache_dir),
                    )
                    loaded_device = device
                    if device == "cuda" and torch is not None:
                        torch.cuda.empty_cache()
                    if progress_callback:
                        progress_callback(85, f"Modelo {self.model_size} listo en {device}.")
                    break
                except Exception as exc:  # pragma: no cover - depends on runtime environment
                    last_error = exc
                    if device == "cuda":
                        emit(
                            "device.cuda-error",
                            "Fallo al inicializar CUDA; probando alternativas",
                            {
                                "model": self.model_size,
                                "compute_type": compute_type,
                                "error": str(exc),
                            },
                            "warning",
                        )
                    emit(
                        "load-model.retry",
                        "Reintentando carga de modelo faster-whisper",
                        {
                            "model": self.model_size,
                            "device": device,
                            "compute_type": compute_type,
                            "cpu_threads": cpu_threads,
                            "num_workers": num_workers,
                            "error": str(exc),
                        },
                        "warning",
                    )
                    if torch is not None and device == "cuda":
                        try:
                            torch.cuda.empty_cache()
                        except Exception:
                            pass
                    continue
            if self._model is not None:
                break

        if self._model is None:
            emit(
                "load-model.failed",
                "No se pudo cargar faster-whisper con la configuración disponible",
                {
                    "model": self.model_size,
                    "requested": requested_label,
                    "torch_cuda": torch_available,
                    "error": str(last_error) if last_error else None,
                },
                "error",
            )
            if last_error is not None:
                raise last_error
            raise RuntimeError("Unable to load faster-whisper model with available configurations")

        if initial_device == "cuda" and loaded_device != "cuda":
            emit(
                "device.fallback",
                "CUDA falló; se usará CPU para faster-whisper",
                {
                    "requested": requested_label,
                    "torch_cuda": torch_available,
                },
                "warning",
            )
        if self._model is not None and progress_callback:
            progress_callback(100, f"faster-whisper listo en {self._current_device()}.")

    def _estimate_duration(self, audio_path: Path) -> Optional[float]:
        try:
            import soundfile as sf  # type: ignore

            info = sf.info(str(audio_path))
            return float(info.frames) / float(info.samplerate)
        except Exception:
            try:
                audio = AudioSegment.from_file(audio_path)
                return len(audio) / 1000.0
            except Exception as exc:
                logger.debug("Unable to estimate duration for %s: %s", audio_path, exc)
                return None

    def prepare(
        self,
        *,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> None:
        with self._lock:
            if self._model is not None:
                if progress_callback:
                    progress_callback(100, f"faster-whisper listo en {self._current_device()}.")
                return
            self._ensure_model(progress_callback=progress_callback)

    def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        beam_size: Optional[int] = None,
        debug_callback: Optional[Callable[[str, str, Optional[Dict[str, object]], str], None]] = None,
    ) -> TranscriptionResult:
        def emit(stage: str, message: str, extra: Optional[Dict[str, object]] = None, level: str = "info") -> None:
            if debug_callback:
                debug_callback(stage, message, extra, level)

        with self._lock:
            self._ensure_model(debug_callback=emit)
        assert self._model is not None

        device = self._current_device()
        if not language and not getattr(settings, "whisper_language", None):
            detected = _detect_language_fast(audio_path, device, debug_callback=emit)
            if detected:
                language = detected

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
                    beam_size=beam_size or 5,
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
            {"runtime_seconds": runtime, "beam_size": beam_size or 5},
        )

        segment_results: List[SegmentResult] = []
        collected_text: List[str] = []
        for index, segment in enumerate(segments):
            text = getattr(segment, "text", "").strip()
            if not text:
                continue
            start = float(getattr(segment, "start", 0.0))
            end = float(getattr(segment, "end", 0.0))
            collected_text.append(text)
            segment_results.append(
                SegmentResult(
                    start=start,
                    end=end,
                    speaker="SPEAKER_00",
                    text=text,
                )
            )
            emit(
                "transcribe.segment",
                "Segmento transcrito",
                {
                    "index": index,
                    "start": start,
                    "end": end,
                    "speaker": "SPEAKER_00",
                    "text": text,
                    "partial_text": " ".join(collected_text).strip(),
                },
                "debug",
            )

        language_result = getattr(info, "language", language)
        duration = getattr(info, "duration", None) or self._estimate_duration(audio_path)

        return TranscriptionResult(
            text=" ".join(collected_text).strip(),
            language=language_result,
            duration=duration,
            segments=segment_results,
            runtime_seconds=runtime,
        )
