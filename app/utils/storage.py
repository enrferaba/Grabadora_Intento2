from __future__ import annotations

import shutil
import re
from pathlib import Path
from typing import BinaryIO, Optional

from fastapi import UploadFile

from ..config import settings


_SAFE_COMPONENT = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_component(value: str, fallback: str) -> str:
    candidate = _SAFE_COMPONENT.sub("-", value.strip().lower())
    candidate = candidate.strip("-_.")
    return candidate or fallback


def save_upload_file(upload: UploadFile, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    return destination


def copy_file(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return dest


def ensure_storage_subdir(*parts: str) -> Path:
    root = Path(settings.storage_dir)
    path = root.joinpath(*parts)
    path.mkdir(parents=True, exist_ok=True)
    return path


def sanitize_folder_name(value: str, fallback: str = "transcripciones") -> str:
    return _sanitize_component(value, fallback)


def ensure_transcript_subdir(folder: str) -> Path:
    safe_folder = sanitize_folder_name(folder)
    path = Path(settings.transcripts_dir) / safe_folder
    path.mkdir(parents=True, exist_ok=True)
    return path


def compute_txt_path(
    transcription_id: int,
    *,
    folder: Optional[str] = None,
    original_filename: Optional[str] = None,
    ensure_unique: bool = False,
) -> Path:
    base_folder = folder or f"transcription-{transcription_id}"
    target_dir = ensure_transcript_subdir(base_folder)

    if original_filename:
        stem = Path(original_filename).stem or f"transcription-{transcription_id}"
    else:
        stem = f"transcription-{transcription_id}"
    safe_stem = _sanitize_component(stem, f"transcription-{transcription_id}")

    candidate = target_dir / f"{safe_stem}.txt"
    if ensure_unique:
        suffix = 1
        while candidate.exists():
            candidate = target_dir / f"{safe_stem}-{suffix}.txt"
            suffix += 1
    return candidate
