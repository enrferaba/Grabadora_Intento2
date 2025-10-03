from __future__ import annotations

import shutil
from pathlib import Path
from typing import BinaryIO

from fastapi import UploadFile

from ..config import settings


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


def compute_txt_path(transcription_id: int) -> Path:
    return Path(settings.transcripts_dir) / f"transcription_{transcription_id}.txt"
