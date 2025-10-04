from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

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
from ..whisper_service import get_transcriber, serialize_segments

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

MODEL_ALIASES = {
    "large": "large-v3",
    "large-v2": "large-v2",
    "large-v3": "large-v3",
    "large3": "large-v3",
    "medium": "medium",
    "small": "small",
}

DEVICE_ALIASES = {
    "gpu": "cuda",
    "cuda": "cuda",
    "cpu": "cpu",
}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


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
    choice = MODEL_ALIASES.get(value.lower())
    return choice or settings.whisper_model_size


def _resolve_device_choice(value: Optional[str]) -> str:
    if not value:
        return settings.whisper_device or "cuda"
    resolved = DEVICE_ALIASES.get(value.lower())
    return resolved or settings.whisper_device or "cuda"


def _enqueue_transcription(
    session: Session,
    background_tasks: BackgroundTasks,
    upload: UploadFile,
    language: Optional[str],
    subject: Optional[str],
    destination_folder: str,
    model_size: Optional[str] = None,
    device_preference: Optional[str] = None,
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
    )
    return transcription


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

    append_debug_event(
        transcription_id,
        "processing-start",
        "Procesamiento iniciado",
        extra={
            "model": resolved_model,
            "device": resolved_device,
            "language": language,
        },
    )
    try:
        stored_path: Optional[str] = None
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

        result = transcriber.transcribe(
            audio_path,
            language or transcription.language,
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
    transcription = session.get(Transcription, transcription_id)
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcripción no encontrada")
    return TranscriptionDetail.from_orm(transcription)


@router.get("/{transcription_id}/download")
def download_transcription(transcription_id: int, session: Session = Depends(_get_session)) -> FileResponse:
    transcription = session.get(Transcription, transcription_id)
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcripción no encontrada")
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
