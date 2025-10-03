from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_session
from ..models import Transcription, TranscriptionStatus
from ..schemas import (
    HealthResponse,
    SearchResponse,
    TranscriptionCreateResponse,
    TranscriptionDetail,
)
from ..utils.storage import compute_txt_path, ensure_storage_subdir, save_upload_file
from ..whisper_service import get_transcriber, serialize_segments

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


@router.post("/", response_model=TranscriptionCreateResponse, status_code=201)
def create_transcription(
    background_tasks: BackgroundTasks,
    upload: UploadFile = File(...),
    language: Optional[str] = None,
    subject: Optional[str] = None,
    session: Session = Depends(_get_session),
) -> TranscriptionCreateResponse:
    _validate_upload_size(upload)
    transcription = Transcription(
        original_filename=upload.filename,
        stored_path="",
        language=language,
        subject=subject,
        status=TranscriptionStatus.PENDING.value,
    )
    session.add(transcription)
    session.flush()

    storage_dir = ensure_storage_subdir(str(transcription.id))
    dest_path = storage_dir / upload.filename
    save_upload_file(upload, dest_path)

    transcription.stored_path = str(dest_path)
    transcription.status = TranscriptionStatus.PROCESSING.value
    session.commit()

    background_tasks.add_task(process_transcription, transcription.id, language)

    return TranscriptionCreateResponse(id=transcription.id, status=transcription.status)


def process_transcription(transcription_id: int, language: Optional[str]) -> None:
    transcriber = get_transcriber()
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


@router.get("/", response_model=SearchResponse)
def list_transcriptions(
    q: Optional[str] = Query(default=None, description="Texto a buscar"),
    status: Optional[TranscriptionStatus] = Query(default=None),
    session: Session = Depends(_get_session),
) -> SearchResponse:
    query = session.query(Transcription)
    if status:
        query = query.filter(Transcription.status == status.value)
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


@router.delete("/{transcription_id}", status_code=204)
def delete_transcription(transcription_id: int, session: Session = Depends(_get_session)) -> None:
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
