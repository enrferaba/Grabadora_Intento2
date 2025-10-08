from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

from ..config import settings


_SAFE_COMPONENT = re.compile(r"[^A-Za-z0-9._-]+")


def _sanitize_component(value: str, fallback: str) -> str:
    candidate = _SAFE_COMPONENT.sub("-", value.strip().lower())
    candidate = candidate.strip("-_.")
    return candidate or fallback


def save_upload_file(upload: UploadFile, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(destination.parent), suffix=".tmp")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as buffer:
            shutil.copyfileobj(upload.file, buffer)
        tmp_path.replace(destination)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    return destination


def copy_file(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return dest


def write_atomic_text(path: Path, content: str, encoding: str = "utf-8") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding=encoding) as handle:
            handle.write(content)
        tmp_path.replace(path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    return path


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


def _compute_sha256(path: Path, *, chunk_size: int = 1 << 20) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def ensure_normalized_audio(source: Path) -> Path:
    """Convert *source* into a cached 16 kHz mono PCM WAV and return its path."""

    if not source.exists():
        raise FileNotFoundError(source)

    digest = _compute_sha256(source)
    cache_path = Path(settings.audio_cache_dir) / f"{digest}.wav"
    if cache_path.exists():
        return cache_path

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        temp_copy = cache_path.with_suffix(cache_path.suffix + ".tmp")
        shutil.copy2(source, temp_copy)
        temp_copy.replace(cache_path)
        return cache_path
    fd, tmp_name = tempfile.mkstemp(dir=str(cache_path.parent), suffix=".wav.tmp")
    os.close(fd)
    tmp_path = Path(tmp_name)
    command = [
        ffmpeg_path,
        "-y",
        "-i",
        str(source),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-sample_fmt",
        "s16",
        str(tmp_path),
    ]
    try:
        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        tmp_path.replace(cache_path)
    except subprocess.CalledProcessError as exc:
        tmp_path.unlink(missing_ok=True)
        stderr = exc.stderr.decode("utf-8", "ignore") if exc.stderr else str(exc)
        raise RuntimeError(f"ffmpeg failed to normalise audio: {stderr}") from exc
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    return cache_path
