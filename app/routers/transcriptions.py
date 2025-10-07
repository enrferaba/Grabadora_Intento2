from __future__ import annotations

import json
import logging
import mimetypes
import secrets
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Annotated, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_session
from ..models import Transcription, TranscriptionStatus
from ..schemas import (
    BatchTranscriptionCreateResponse,
    HealthResponse,
    LiveChunkResponse,
    LiveFinalizeRequest,
    LiveFinalizeResponse,
    LiveSessionCreateRequest,
    LiveSessionCreateResponse,
    ModelPreparationRequest,
    ModelPreparationStatus,
    SearchResponse,
    TranscriptionCreateResponse,
    TranscriptionDetail,
)
from ..utils.debug import append_debug_event
from ..utils.storage import (
    compute_txt_path,
    ensure_storage_subdir,
    sanitize_folder_name,
    save_upload_file,
)
from ..whisper_service import (
    get_model_preparation_status,
    get_transcriber,
    request_model_preparation,
    serialize_segments,
)
from pydub import AudioSegment

ALLOWED_MEDIA_EXTENSIONS = {
    ".aac",
    ".flac",
    ".m4a",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".ogg",
    ".wav",
    ".webm",
    ".wma",
}
ALLOWED_MEDIA_PREFIXES = ("audio/", "video/")

SUPPORTED_MODEL_SIZES = {
    "turbo": "turbo",
    "tiny": "tiny",
    "tiny.en": "tiny.en",
    "base": "base",
    "base.en": "base.en",
    "small": "small",
    "small.en": "small.en",
    "medium": "medium",
    "medium.en": "medium.en",
    "large": "large",
    "large-v1": "large-v1",
    "large-v2": "large-v2",
    "large-v3": "large-v3",
}

MODEL_ALIASES = {
    "large3": "large-v3",
    "large_v3": "large-v3",
    "largev3": "large-v3",
}

DEVICE_ALIASES = {
    "gpu": "cuda",
    "cuda": "cuda",
    "cpu": "cpu",
}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])

LIVE_SESSIONS_ROOT = Path(settings.storage_dir).parent / "live_sessions"
LIVE_SESSIONS_ROOT.mkdir(parents=True, exist_ok=True)


@dataclass
class LiveSessionState:
    session_id: str
    model_size: str
    device: str
    language: Optional[str]
    beam_size: Optional[int]
    directory: Path
    audio_path: Path
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    chunk_count: int = 0
    last_text: str = ""
    last_duration: Optional[float] = None
    last_runtime: Optional[float] = None
    segments: List[dict] = field(default_factory=list)
    lock: Lock = field(default_factory=Lock)


LIVE_SESSIONS: Dict[str, LiveSessionState] = {}
LIVE_SESSION_TTL_SECONDS = 3600


def purge_expired_live_sessions() -> None:
    now = time.time()
    expired_ids = []
    for session_id, state in list(LIVE_SESSIONS.items()):
        last_seen = state.last_activity or state.created_at
        if now - last_seen > LIVE_SESSION_TTL_SECONDS:
            expired_ids.append(session_id)
    for session_id in expired_ids:
        _cleanup_live_session(session_id)


def _get_session() -> Session:
    with get_session() as session:
        yield session


@router.get("/health", response_model=HealthResponse, tags=["health"])
def healthcheck() -> HealthResponse:
    return HealthResponse(status="ok", app_name=settings.app_name)


def _validate_upload_size(upload: UploadFile) -> None:
    upload.file.seek(0, 2)
    size = upload.file.tell()
    upload.file.seek(0)
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if size > max_bytes:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande")


def _resolve_model_choice(value: Optional[str]) -> str:
    if not value:
        return settings.whisper_model_size
    normalized = value.strip().lower()
    direct = SUPPORTED_MODEL_SIZES.get(normalized)
    if direct:
        return direct
    alias = MODEL_ALIASES.get(normalized)
    if alias:
        return alias
    logger.warning("Modelo whisper desconocido %s, usando predeterminado", value)
    return settings.whisper_model_size


def _resolve_device_choice(value: Optional[str]) -> str:
    if not value:
        return settings.whisper_device or "cuda"
    resolved = DEVICE_ALIASES.get(value.lower())
    return resolved or settings.whisper_device or "cuda"


def _model_status_to_schema(
    model_size: str,
    device: str,
    info,
) -> ModelPreparationStatus:
    return ModelPreparationStatus(
        model_size=model_size,
        device_preference=device,
        status=info.status,
        progress=info.progress,
        message=info.message,
        error=info.error,
    )


def _require_live_session(session_id: str) -> LiveSessionState:
    purge_expired_live_sessions()
    state = LIVE_SESSIONS.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Sesión en vivo no encontrada")
    return state


def _get_transcription_or_404(session: Session, transcription_id: int) -> Transcription:
    transcription = session.get(Transcription, transcription_id)
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcripción no encontrada")
    return transcription


@router.post("/models/prepare", response_model=ModelPreparationStatus, status_code=202)
def prepare_model(
    payload: ModelPreparationRequest,
    response: Response,
) -> ModelPreparationStatus:
    resolved_model = _resolve_model_choice(payload.model_size)
    resolved_device = _resolve_device_choice(payload.device_preference)
    info = request_model_preparation(resolved_model, resolved_device)
    if info.status == "ready":
        response.status_code = status.HTTP_200_OK
    return _model_status_to_schema(resolved_model, resolved_device, info)


@router.get("/models/status", response_model=ModelPreparationStatus)
def get_model_status(
    model_size: Optional[str] = Query(default=None),
    device_preference: Optional[str] = Query(default=None),
) -> ModelPreparationStatus:
    resolved_model = _resolve_model_choice(model_size)
    resolved_device = _resolve_device_choice(device_preference)
    info = get_model_preparation_status(resolved_model, resolved_device)
    return _model_status_to_schema(resolved_model, resolved_device, info)


def _format_srt_timestamp(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def _guess_audio_format(path: Path) -> Optional[str]:
    suffix = path.suffix.lower()
    if suffix in {".webm"}:
        return "webm"
    if suffix in {".ogg", ".oga"}:
        return "ogg"
    if suffix in {".wav"}:
        return "wav"
    if suffix in {".mp3"}:
        return "mp3"
    if suffix in {".m4a", ".mp4", ".m4v", ".mov"}:
        return "mp4"
    return None


def _transcription_to_srt(transcription: Transcription) -> str:
    entries: List[str] = []
    segments = transcription.speakers or []
    if segments:
        for index, segment in enumerate(segments, start=1):
            start = float(segment.get("start") or 0.0)
            end = float(segment.get("end") or (start + 4.0))
            text = (segment.get("text") or "").strip()
            if not text:
                continue
            entry = "\n".join(
                [
                    str(index),
                    f"{_format_srt_timestamp(start)} --> {_format_srt_timestamp(end)}",
                    text,
                    "",
                ]
            )
            entries.append(entry)
    else:
        body = transcription.text or ""
        paragraphs = [paragraph.strip() for paragraph in body.split("\n") if paragraph.strip()]
        if not paragraphs:
            paragraphs = [body.strip() or "Transcripción en proceso"]
        for index, paragraph in enumerate(paragraphs, start=1):
            start = float((index - 1) * 5)
            approx_duration = max(4.0, min(12.0, len(paragraph.split()) / 2.5 + 2))
            end = start + approx_duration
            entry = "\n".join(
                [
                    str(index),
                    f"{_format_srt_timestamp(start)} --> {_format_srt_timestamp(end)}",
                    paragraph,
                    "",
                ]
            )
            entries.append(entry)
    if not entries:
        entries.append(
            "\n".join(
                [
                    "1",
                    "00:00:00,000 --> 00:00:05,000",
                    transcription.text or "Transcripción en progreso",
                    "",
                ]
            )
        )
    return "\n".join(entries).strip() + "\n"


def _merge_live_chunk(state: LiveSessionState, chunk_path: Path) -> AudioSegment:
    try:
        fmt = _guess_audio_format(chunk_path)
        segment = AudioSegment.from_file(chunk_path, format=fmt) if fmt else AudioSegment.from_file(chunk_path)
    except Exception as exc:  # pragma: no cover - depende del runtime
        raise RuntimeError(f"No se pudo procesar el fragmento de audio: {exc}") from exc

    if state.audio_path.exists():
        try:
            base = AudioSegment.from_file(state.audio_path, format="wav")
            combined = base + segment
        except Exception as exc:  # pragma: no cover - depende del runtime
            raise RuntimeError(f"No se pudo unir el audio acumulado: {exc}") from exc
    else:
        combined = segment

    combined.export(state.audio_path, format="wav")
    return segment


def _cleanup_live_session(session_id: str) -> None:
    state = LIVE_SESSIONS.pop(session_id, None)
    if state:
        shutil.rmtree(state.directory, ignore_errors=True)


def _enqueue_transcription(
    session: Session,
    background_tasks: BackgroundTasks,
    upload: UploadFile,
    language: Optional[str],
    subject: Optional[str],
    destination_folder: str,
    model_size: Optional[str] = None,
    device_preference: Optional[str] = None,
    beam_size: Optional[int] = None,
) -> Transcription:
    if not _is_supported_media(upload):
        raise HTTPException(
            status_code=400,
            detail="Solo se permiten archivos de audio o video",
        )
    _validate_upload_size(upload)
    if not destination_folder or not destination_folder.strip():
        raise HTTPException(status_code=400, detail="Debes indicar una carpeta de destino")
    sanitized_folder = sanitize_folder_name(destination_folder)
    resolved_model = _resolve_model_choice(model_size)
    resolved_device = _resolve_device_choice(device_preference)
    transcription = Transcription(
        original_filename=upload.filename,
        stored_path="",
        language=language,
        model_size=resolved_model,
        beam_size=beam_size,
        device_preference=resolved_device,
        subject=subject,
        output_folder=sanitized_folder,
        status=TranscriptionStatus.PROCESSING.value,
    )
    session.add(transcription)
    session.flush()

    storage_dir = ensure_storage_subdir(str(transcription.id))
    dest_path = storage_dir / upload.filename
    save_upload_file(upload, dest_path)
    upload.file.close()

    transcription.stored_path = str(dest_path)
    planned_txt_path = compute_txt_path(
        transcription.id,
        folder=sanitized_folder,
        original_filename=upload.filename,
        ensure_unique=True,
    )
    transcription.transcript_path = str(planned_txt_path)
    session.commit()

    append_debug_event(
        transcription.id,
        "enqueued",
        "Archivo encolado para transcripción",
        extra={
            "filename": transcription.original_filename,
            "language": language,
            "subject": subject,
            "model": resolved_model,
            "beam_size": beam_size,
            "device": resolved_device,
            "output_folder": sanitized_folder,
        },
    )

    background_tasks.add_task(
        process_transcription,
        transcription.id,
        language,
        resolved_model,
        resolved_device,
        beam_size,
    )
    return transcription


@router.post("/live/sessions", response_model=LiveSessionCreateResponse, status_code=201)
def create_live_session(payload: LiveSessionCreateRequest) -> LiveSessionCreateResponse:
    purge_expired_live_sessions()
    session_id = secrets.token_urlsafe(12)
    resolved_model = _resolve_model_choice(payload.model_size)
    resolved_device = _resolve_device_choice(payload.device_preference)
    directory = LIVE_SESSIONS_ROOT / session_id
    directory.mkdir(parents=True, exist_ok=True)
    state = LiveSessionState(
        session_id=session_id,
        model_size=resolved_model,
        device=resolved_device,
        language=payload.language,
        beam_size=payload.beam_size,
        directory=directory,
        audio_path=directory / "stream.wav",
    )
    LIVE_SESSIONS[session_id] = state
    return LiveSessionCreateResponse(
        session_id=session_id,
        model_size=resolved_model,
        device_preference=resolved_device,
        language=payload.language,
        beam_size=payload.beam_size,
    )


@router.post("/live/sessions/{session_id}/chunk", response_model=LiveChunkResponse)
def push_live_chunk(session_id: str, chunk: UploadFile = File(...)) -> LiveChunkResponse:
    purge_expired_live_sessions()
    state = _require_live_session(session_id)
    data = chunk.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="El fragmento está vacío")
    suffix = Path(chunk.filename or "").suffix or ".webm"
    index = state.chunk_count
    chunk_path = state.directory / f"chunk-{index:05d}{suffix}"
    chunk_path.write_bytes(data)
    chunk.file.close()
    with state.lock:
        try:
            segment = _merge_live_chunk(state, chunk_path)
        except RuntimeError as exc:
            chunk_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            chunk_path.unlink(missing_ok=True)
        transcriber = get_transcriber(state.model_size, state.device)
        try:
            result = transcriber.transcribe(
                state.audio_path,
                state.language,
                beam_size=state.beam_size,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:  # pragma: no cover - dependerá del runtime
            raise HTTPException(
                status_code=500,
                detail=f"Error al transcribir el fragmento: {exc}",
            ) from exc
        state.chunk_count = index + 1
        serialized_segments = serialize_segments(result.segments)
        previous_segments = state.segments
        new_segments = serialized_segments[len(previous_segments) :]
        state.segments = serialized_segments
        aggregated_text = (result.text or "").strip()
        if not aggregated_text and serialized_segments:
            aggregated_text = " ".join(
                segment.get("text", "").strip()
                for segment in serialized_segments
                if segment.get("text")
            ).strip()
        previous_text = state.last_text or ""
        state.last_text = aggregated_text or previous_text
        appended_text: Optional[str] = None
        if new_segments:
            appended_text = " ".join(
                segment.get("text", "").strip()
                for segment in new_segments
                if segment.get("text")
            ).strip() or None
        elif state.last_text and state.last_text != previous_text:
            if previous_text and state.last_text.startswith(previous_text):
                appended_text = state.last_text[len(previous_text) :].strip() or None
            else:
                appended_text = state.last_text
        elif not previous_text:
            appended_text = state.last_text or None
        state.last_duration = result.duration
        state.last_runtime = result.runtime_seconds
        state.language = result.language or state.language
        state.last_activity = time.time()
    return LiveChunkResponse(
        session_id=session_id,
        text=state.last_text,
        duration=state.last_duration,
        runtime_seconds=state.last_runtime,
        chunk_count=state.chunk_count,
        model_size=state.model_size,
        device_preference=state.device,
        language=state.language,
        beam_size=state.beam_size,
        segments=list(state.segments),
        new_segments=list(new_segments),
        new_text=appended_text,
    )


@router.post("/live/sessions/{session_id}/finalize", response_model=LiveFinalizeResponse)
def finalize_live_session(
    session_id: str,
    payload: LiveFinalizeRequest,
    session: Session = Depends(_get_session),
) -> LiveFinalizeResponse:
    state = _require_live_session(session_id)
    with state.lock:
        if not state.audio_path.exists():
            raise HTTPException(status_code=400, detail="No se capturó audio en la sesión en vivo")
        state.last_activity = time.time()
        resolved_model = _resolve_model_choice(payload.model_size or state.model_size)
        resolved_device = _resolve_device_choice(payload.device_preference or state.device)
        resolved_language = payload.language or state.language
        if payload.beam_size is not None:
            state.beam_size = payload.beam_size
        transcriber = get_transcriber(resolved_model, resolved_device)
        result = transcriber.transcribe(
            state.audio_path,
            resolved_language,
            beam_size=payload.beam_size or state.beam_size,
        )
        sanitized_folder = sanitize_folder_name(payload.destination_folder or "en-vivo")
        final_filename = payload.filename or f"live-session-{session_id}.wav"
        storage_dir = ensure_storage_subdir(f"live-{session_id}")
        target_audio_path = storage_dir / final_filename
        shutil.copy(state.audio_path, target_audio_path)
        transcription = Transcription(
            original_filename=final_filename,
            stored_path=str(target_audio_path),
            language=result.language or resolved_language,
            model_size=resolved_model,
            beam_size=payload.beam_size or state.beam_size,
            device_preference=resolved_device,
            subject=payload.subject,
            output_folder=sanitized_folder,
            status=TranscriptionStatus.COMPLETED.value,
            text=result.text,
            duration=result.duration,
            runtime_seconds=result.runtime_seconds,
        )
        session.add(transcription)
        session.flush()
        transcript_path = compute_txt_path(
            transcription.id,
            folder=sanitized_folder,
            original_filename=final_filename,
            ensure_unique=True,
        )
        transcript_path.parent.mkdir(parents=True, exist_ok=True)
        transcript_path.write_text(transcription.to_txt(), encoding="utf-8")
        transcription.transcript_path = str(transcript_path)
        session.commit()
        append_debug_event(
            transcription.id,
            "live-finalized",
            "Sesión en vivo finalizada y almacenada",
            extra={
                "chunks": state.chunk_count,
                "live_session": session_id,
                "beam_size": payload.beam_size or state.beam_size,
            },
        )
        response = LiveFinalizeResponse(
            session_id=session_id,
            transcription_id=transcription.id,
            text=result.text,
            duration=result.duration,
            runtime_seconds=result.runtime_seconds,
            output_folder=sanitized_folder,
            transcript_path=transcription.transcript_path,
            model_size=resolved_model,
            device_preference=resolved_device,
            language=result.language or resolved_language,
            beam_size=payload.beam_size or state.beam_size,
        )
    _cleanup_live_session(session_id)
    return response


@router.delete("/live/sessions/{session_id}", status_code=204)
def discard_live_session(session_id: str) -> Response:
    state = LIVE_SESSIONS.get(session_id)
    if state is not None:
        with state.lock:
            pass
    _cleanup_live_session(session_id)
    return Response(status_code=204)


def _is_supported_media(upload: UploadFile) -> bool:
    content_type = (upload.content_type or "").lower()
    if any(content_type.startswith(prefix) for prefix in ALLOWED_MEDIA_PREFIXES):
        return True

    filename = (upload.filename or "").lower()
    suffix = Path(filename).suffix
    if suffix in ALLOWED_MEDIA_EXTENSIONS:
        return True

    return any(filename.endswith(ext) for ext in ALLOWED_MEDIA_EXTENSIONS)


@router.post("", response_model=TranscriptionCreateResponse, status_code=201)
def create_transcription(
    background_tasks: BackgroundTasks,
    upload: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    subject: Optional[str] = Form(default=None),
    destination_folder: str = Form(..., description="Carpeta obligatoria dentro de transcripts_dir"),
    model_size: Optional[str] = Form(default=None),
    device_preference: Optional[str] = Form(default=None),
    beam_size: Annotated[Optional[int], Form()] = None,
    session: Session = Depends(_get_session),
) -> TranscriptionCreateResponse:
    transcription = _enqueue_transcription(
        session,
        background_tasks,
        upload,
        language,
        subject,
        destination_folder,
        model_size,
        device_preference,
        beam_size,
    )

    return TranscriptionCreateResponse(
        id=transcription.id,
        status=TranscriptionStatus(transcription.status),
        original_filename=transcription.original_filename,
    )


@router.post("/batch", response_model=BatchTranscriptionCreateResponse, status_code=201)
def create_batch_transcriptions(
    background_tasks: BackgroundTasks,
    uploads: List[UploadFile] = File(...),
    language: Optional[str] = Form(default=None),
    subject: Optional[str] = Form(default=None),
    destination_folder: str = Form(...),
    model_size: Optional[str] = Form(default=None),
    device_preference: Optional[str] = Form(default=None),
    beam_size: Annotated[Optional[int], Form()] = None,
    session: Session = Depends(_get_session),
) -> BatchTranscriptionCreateResponse:
    if not uploads:
        raise HTTPException(status_code=400, detail="Debes adjuntar al menos un archivo")

    responses: List[TranscriptionCreateResponse] = []
    for upload in uploads:
        transcription = _enqueue_transcription(
            session,
            background_tasks,
            upload,
            language,
            subject,
            destination_folder,
            model_size,
            device_preference,
            beam_size,
        )
        responses.append(
            TranscriptionCreateResponse(
                id=transcription.id,
                status=TranscriptionStatus(transcription.status),
                original_filename=transcription.original_filename,
            )
        )

    return BatchTranscriptionCreateResponse(items=responses)


def process_transcription(
    transcription_id: int,
    language: Optional[str],
    model_size: Optional[str],
    device_preference: Optional[str],
    beam_size: Optional[int],
) -> None:
    resolved_model = _resolve_model_choice(model_size)
    resolved_device = _resolve_device_choice(device_preference)
    transcriber = get_transcriber(resolved_model, resolved_device)

    def debug_callback(stage: str, message: str, extra: Optional[Dict[str, object]], level: str = "info") -> None:
        append_debug_event(transcription_id, stage, message, extra=extra, level=level)
        if stage == "transcribe.segment" and extra:
            partial_text = str(extra.get("partial_text") or "").strip()
            if partial_text:
                with get_session() as update_session:
                    partial = update_session.get(Transcription, transcription_id)
                    if partial is not None and (partial.text or "").strip() != partial_text:
                        partial.text = partial_text
                        update_session.commit()

    append_debug_event(
        transcription_id,
        "processing-start",
        "Procesamiento iniciado",
        extra={
            "model": resolved_model,
            "device": resolved_device,
            "language": language,
            "beam_size": beam_size,
        },
    )
    try:
        stored_path: Optional[str] = None
        existing_duration: Optional[float] = None
        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if transcription is None:
                logger.warning("Transcription %s missing", transcription_id)
                return
            transcription.status = TranscriptionStatus.PROCESSING.value
            transcription.model_size = resolved_model
            transcription.device_preference = resolved_device
            transcription.runtime_seconds = None
            stored_path = transcription.stored_path
            existing_duration = transcription.duration

        assert stored_path is not None
        audio_path = Path(stored_path)
        if not audio_path.exists():
            message = (
                "El archivo original ya no está disponible; la transcripción se canceló o eliminó."
            )
            with get_session() as session:
                transcription = session.get(Transcription, transcription_id)
                if transcription is not None:
                    transcription.status = TranscriptionStatus.FAILED.value
                    transcription.error_message = message
            append_debug_event(
                transcription_id,
                "processing-missing-file",
                message,
                level="warning",
            )
            return

        duration_hint: Optional[float] = existing_duration
        if duration_hint is None:
            try:
                audio_info = AudioSegment.from_file(audio_path)
                duration_hint = len(audio_info) / 1000.0
            except Exception as exc:  # pragma: no cover - depende del runtime
                logger.debug(
                    "No se pudo estimar la duración preliminar para %s: %s",
                    audio_path,
                    exc,
                )
            else:
                append_debug_event(
                    transcription_id,
                    "analyze.duration",
                    "Duración estimada del audio",
                    extra={"seconds": duration_hint},
                )
                with get_session() as update_session:
                    partial = update_session.get(Transcription, transcription_id)
                    if partial is not None and not partial.duration:
                        partial.duration = duration_hint

        result = transcriber.transcribe(
            audio_path,
            language or transcription.language,
            beam_size=beam_size,
            debug_callback=debug_callback,
        )
        completion_extra = {
            "duration": result.duration,
            "runtime_seconds": result.runtime_seconds,
            "segments": len(result.segments),
        }

        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if transcription is None:
                return
            transcription.text = result.text
            transcription.language = result.language or language
            transcription.model_size = resolved_model
            transcription.beam_size = beam_size
            transcription.device_preference = resolved_device
            transcription.duration = result.duration
            transcription.runtime_seconds = result.runtime_seconds
            transcription.speakers = serialize_segments(result.segments)
            transcription.status = TranscriptionStatus.COMPLETED.value
            transcription.error_message = None
            stored_folder = transcription.output_folder or "transcripciones"
            target_path = (
                Path(transcription.transcript_path)
                if transcription.transcript_path
                else compute_txt_path(
                    transcription.id,
                    folder=stored_folder,
                    original_filename=transcription.original_filename,
                )
            )
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(transcription.to_txt(), encoding="utf-8")
            transcription.transcript_path = str(target_path)

        append_debug_event(
            transcription_id,
            "processing-complete",
            "Transcripción finalizada correctamente",
            extra=completion_extra,
        )
    except Exception as exc:  # pragma: no cover - runtime safeguard
        logger.exception("Failed to transcribe %s", transcription_id)
        error_message = str(exc)
        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if transcription is None:
                return
            transcription.status = TranscriptionStatus.FAILED.value
            transcription.error_message = error_message

        append_debug_event(
            transcription_id,
            "processing-error",
            "Error durante la transcripción",
            extra={"error": error_message},
            level="error",
        )


@router.get("", response_model=SearchResponse)
def list_transcriptions(
    q: Optional[str] = Query(default=None, description="Texto a buscar"),
    status: Optional[TranscriptionStatus] = Query(default=None),
    premium_only: bool = Query(default=False, description="Solo resultados premium"),
    session: Session = Depends(_get_session),
) -> SearchResponse:
    query = session.query(Transcription)
    if status:
        query = query.filter(Transcription.status == status.value)
    if premium_only:
        query = query.filter(Transcription.premium_enabled.is_(True))
    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Transcription.text).like(pattern),
                func.lower(Transcription.original_filename).like(pattern),
                func.lower(func.coalesce(Transcription.subject, "")).like(pattern),
            )
        )
    query = query.order_by(Transcription.created_at.desc())
    results = [TranscriptionDetail.from_orm(item) for item in query.all()]
    return SearchResponse(results=results, total=len(results))


@router.get("/{transcription_id}", response_model=TranscriptionDetail)
def get_transcription(transcription_id: int, session: Session = Depends(_get_session)) -> TranscriptionDetail:
    transcription = _get_transcription_or_404(session, transcription_id)
    return TranscriptionDetail.from_orm(transcription)


@router.get("/{transcription_id}/audio")
def download_transcription_audio(
    transcription_id: int,
    session: Session = Depends(_get_session),
) -> FileResponse:
    transcription = _get_transcription_or_404(session, transcription_id)
    audio_path = Path(transcription.stored_path)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio original no disponible")
    media_type, _ = mimetypes.guess_type(audio_path.name)
    return FileResponse(
        audio_path,
        media_type=media_type or "application/octet-stream",
        filename=audio_path.name,
    )


@router.get("/{transcription_id}/logs")
def download_transcription_logs(
    transcription_id: int,
    session: Session = Depends(_get_session),
) -> Response:
    transcription = _get_transcription_or_404(session, transcription_id)
    events = list(transcription.debug_events or [])
    if not events:
        content = "No hay eventos de depuración registrados aún.\n"
    else:
        lines: List[str] = []
        for event in events:
            timestamp = event.get("timestamp", "")
            stage = event.get("stage", "")
            level = event.get("level", "info")
            message = event.get("message", "")
            extra = event.get("extra")
            lines.append(f"[{timestamp}] {level.upper()} · {stage}: {message}")
            if extra:
                formatted_extra = json.dumps(extra, ensure_ascii=False, sort_keys=True)
                lines.append(f"    extra: {formatted_extra}")
        content = "\n".join(lines) + "\n"
    filename = f"transcription-{transcription_id}-logs.txt"
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{transcription_id}/download")
def download_transcription(transcription_id: int, session: Session = Depends(_get_session)) -> FileResponse:
    transcription = _get_transcription_or_404(session, transcription_id)
    txt_path = (
        Path(transcription.transcript_path)
        if transcription.transcript_path
        else compute_txt_path(
            transcription.id,
            folder=transcription.output_folder,
            original_filename=transcription.original_filename,
        )
    )
    if not txt_path.exists():
        raise HTTPException(status_code=404, detail="Archivo TXT no disponible aún")
    return FileResponse(txt_path, media_type="text/plain", filename=txt_path.name)


@router.get("/{transcription_id}.txt")
def download_transcription_txt(
    transcription_id: int,
    session: Session = Depends(_get_session),
) -> Response:
    transcription = _get_transcription_or_404(session, transcription_id)
    content = transcription.to_txt()
    filename = f"{transcription.id}.txt"
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{transcription_id}.srt")
def download_transcription_srt(
    transcription_id: int,
    session: Session = Depends(_get_session),
) -> Response:
    transcription = _get_transcription_or_404(session, transcription_id)
    content = _transcription_to_srt(transcription)
    filename = f"{transcription.id}.srt"
    return Response(
        content=content,
        media_type="application/x-subrip; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{transcription_id}", status_code=204, response_class=Response)
def delete_transcription(transcription_id: int, session: Session = Depends(_get_session)) -> Response:
    transcription = session.get(Transcription, transcription_id)
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcripción no encontrada")
    stored_path = Path(transcription.stored_path)
    txt_path = (
        Path(transcription.transcript_path)
        if transcription.transcript_path
        else compute_txt_path(
            transcription.id,
            folder=transcription.output_folder,
            original_filename=transcription.original_filename,
        )
    )
    session.delete(transcription)
    session.commit()
    if stored_path.exists():  # pragma: no cover - filesystem side effects
        stored_path.unlink()
    if txt_path.exists():  # pragma: no cover - filesystem side effects
        txt_path.unlink()
    return Response(status_code=204)
