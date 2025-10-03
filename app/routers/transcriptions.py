from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

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
from ..utils.storage import compute_txt_path, ensure_storage_subdir, save_upload_file
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
    "large": "large-v2",
    "large-v2": "large-v2",
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
    price_cents: Optional[int] = None,
    currency: Optional[str] = None,
    model_size: Optional[str] = None,
    device_preference: Optional[str] = None,
) -> Transcription:
    if not _is_supported_media(upload):
        raise HTTPException(
            status_code=400,
            detail="Solo se permiten archivos de audio o video",
        )
    _validate_upload_size(upload)
    resolved_model = _resolve_model_choice(model_size)
    resolved_device = _resolve_device_choice(device_preference)
    transcription = Transcription(
        original_filename=upload.filename,
        stored_path="",
        language=language,
        model_size=resolved_model,
        device_preference=resolved_device,
        subject=subject,
        status=TranscriptionStatus.PROCESSING.value,
        price_cents=price_cents,
        currency=currency,
    )
    session.add(transcription)
    session.flush()

    storage_dir = ensure_storage_subdir(str(transcription.id))
    dest_path = storage_dir / upload.filename
    save_upload_file(upload, dest_path)
    upload.file.close()

    transcription.stored_path = str(dest_path)
    session.commit()

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
    price_cents: Optional[int] = Form(default=None),
    currency: Optional[str] = Form(default=None),
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
        price_cents,
        currency,
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
    price_cents: Optional[int] = Form(default=None),
    currency: Optional[str] = Form(default=None),
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
            price_cents,
            currency,
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
    try:
        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if transcription is None:
                logger.warning("Transcription %s missing", transcription_id)
                return
            transcription.status = TranscriptionStatus.PROCESSING.value

        result = transcriber.transcribe(Path(transcription.stored_path), language or transcription.language)
        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if transcription is None:
                return
            transcription.text = result.text
            transcription.language = result.language or language
            transcription.model_size = resolved_model
            transcription.device_preference = resolved_device
            transcription.duration = result.duration
            transcription.speakers = serialize_segments(result.segments)
            transcription.status = TranscriptionStatus.COMPLETED.value
            transcription.error_message = None
            txt_path = compute_txt_path(transcription.id)
            txt_path.write_text(transcription.to_txt(), encoding="utf-8")
    except Exception as exc:  # pragma: no cover - runtime safeguard
        logger.exception("Failed to transcribe %s", transcription_id)
        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if transcription is None:
                return
            transcription.status = TranscriptionStatus.FAILED.value
            transcription.error_message = str(exc)


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
    txt_path = compute_txt_path(transcription.id)
    if not txt_path.exists():
        raise HTTPException(status_code=404, detail="Archivo TXT no disponible aún")
    return FileResponse(txt_path, media_type="text/plain", filename=f"{transcription.original_filename}.txt")


@router.delete("/{transcription_id}", status_code=204, response_class=Response)
def delete_transcription(transcription_id: int, session: Session = Depends(_get_session)) -> Response:
    transcription = session.get(Transcription, transcription_id)
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcripción no encontrada")
    stored_path = Path(transcription.stored_path)
    txt_path = compute_txt_path(transcription.id)
    session.delete(transcription)
    session.commit()
    if stored_path.exists():  # pragma: no cover - filesystem side effects
        stored_path.unlink()
    if txt_path.exists():  # pragma: no cover - filesystem side effects
        txt_path.unlink()
    return Response(status_code=204)
